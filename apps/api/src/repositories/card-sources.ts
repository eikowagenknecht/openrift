import type { ExpressionBuilder, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardSourcesTable,
  CardsTable,
  Database,
  PrintingImagesTable,
  PrintingSourcesTable,
  PrintingsTable,
} from "../db/index.js";
import { resolveCardId } from "./query-helpers.js";

/**
 * Reusable WHERE filter: exclude card_sources that appear in ignored_card_sources.
 * @param alias — the card_sources table alias used in the query (e.g. "cs", "cardSources")
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notIgnoredCard(alias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("ignoredCardSources as ics")
          .select(sql.lit(1).as("x"))
          .where("ics.source", "=", sql<string>`${sql.ref(`${alias}.source`)}`)
          .where("ics.sourceEntityId", "=", sql<string>`${sql.ref(`${alias}.sourceEntityId`)}`),
      ),
    );
}

/**
 * Reusable WHERE filter: exclude card_sources whose source is hidden in source_settings.
 * @param alias — the card_sources table alias used in the query (e.g. "cs", "cardSources")
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notHiddenSource(alias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("sourceSettings as ss")
          .select(sql.lit(1).as("x"))
          .where("ss.source", "=", sql<string>`${sql.ref(`${alias}.source`)}`)
          .where("ss.isHidden", "=", true),
      ),
    );
}

/**
 * Reusable WHERE filter: exclude printing_sources that appear in ignored_printing_sources.
 * @param alias — the printing_sources table alias used in the query (e.g. "ps", "printingSources")
 * @param csAlias — the card_sources table alias to resolve the source name
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notIgnoredPrinting(alias: string, csAlias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("ignoredPrintingSources as ips")
          .select(sql.lit(1).as("x"))
          .where("ips.source", "=", sql<string>`${sql.ref(`${csAlias}.source`)}`)
          .where("ips.sourceEntityId", "=", sql<string>`${sql.ref(`${alias}.sourceEntityId`)}`)
          .where((eb2) =>
            eb2.or([
              eb2("ips.finish", "is", null),
              eb2("ips.finish", "=", sql<string>`${sql.ref(`${alias}.finish`)}`),
            ]),
          ),
      ),
    );
}

// ── Row types for aggregate / joined queries ────────────────────────────────

/** Row returned by `listGroupedSources`. */
interface GroupedSourceRow {
  cardId: string | null;
  cardSlug: string | null;
  name: string;
  groupKey: string;
  sourceCount: number;
  uncheckedCardCount: number;
  uncheckedPrintingCount: number;
  hasGallery: boolean;
  minReleasedAt: string | null;
  releasedSetSlug: string | null;
  hasKnownSet: boolean;
  hasUnknownSet: boolean;
}

/** Row returned by `sourceStats`. */
interface SourceStatRow {
  source: string;
  cardCount: number;
  printingCount: number;
  lastUpdated: string;
}

/** Row returned by `exportPrintings`. */
interface ExportPrintingRow extends Selectable<PrintingsTable> {
  setSlug: string;
  setName: string;
  rehostedUrl: string | null;
  originalUrl: string | null;
}

/**
 * Read-only queries for the card-sources admin UI.
 *
 * Each method performs a single database query (or returns early for empty
 * inputs). Response shaping and multi-query orchestration live in the
 * service layer (`services/card-source-queries.ts`).
 *
 * @returns An object with card-source query methods bound to the given `db`.
 */
export function cardSourcesRepo(db: Kysely<Database>) {
  return {
    // ── Simple list endpoints ─────────────────────────────────────────────

    /** @returns Lightweight card list (id, slug, name, type) ordered by name. */
    listAllCards(): Promise<Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "type">[]> {
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name", "type"])
        .orderBy("name")
        .execute();
    },

    /** @returns Distinct source names (excluding hidden), ordered alphabetically. */
    async distinctSourceNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("cardSources")
        .select("source")
        .distinct()
        .where(notHiddenSource("cardSources"))
        .orderBy("source")
        .execute();
      return rows.map((r) => r.source);
    },

    /** @returns Per-source card count, printing count, and last-updated timestamp. */
    async sourceStats(): Promise<SourceStatRow[]> {
      const rows = await db
        .selectFrom("cardSources as cs")
        .leftJoin("printingSources as ps", "ps.cardSourceId", "cs.id")
        .select((eb) => [
          "cs.source" as const,
          eb.cast<number>(eb.fn.count("cs.name").distinct(), "integer").as("cardCount"),
          eb.cast<number>(eb.fn.count("ps.id").distinct(), "integer").as("printingCount"),
          sql<string>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
            "lastUpdated",
          ),
        ])
        .where(notIgnoredCard("cs"))
        .where(notHiddenSource("cs"))
        .groupBy("cs.source")
        .orderBy("cs.source")
        .execute();

      return rows.map((r) => ({
        source: r.source,
        cardCount: r.cardCount,
        printingCount: r.printingCount,
        lastUpdated: r.lastUpdated,
      }));
    },

    // ── GET / — grouped list sub-queries ──────────────────────────────────

    /**
     * Main aggregate query: card_sources grouped by resolved card_id (matched)
     * or normalized name (unmatched), with source/unchecked counts and set info.
     * @returns Grouped source rows with aggregate counts and set tier info.
     */
    async listGroupedSources(): Promise<GroupedSourceRow[]> {
      const rcid = resolveCardId("cs");
      const rows = await db
        .selectFrom("cardSources as cs")
        .leftJoin("printingSources as ps", "ps.cardSourceId", "cs.id")
        .leftJoin("sets as s", "s.slug", "ps.setId")
        .leftJoin("cards as c", (jb) => jb.on(sql`c.id = (${rcid})`))
        .select((eb) => [
          sql<string | null>`max((${rcid})::text)`.as("cardId"),
          eb.fn.max("c.slug").as("cardSlug"),
          eb.fn.coalesce(eb.fn.max("c.name"), eb.fn.min("cs.name")).as("name"),
          sql<string>`COALESCE((${rcid})::text, cs.norm_name)`.as("groupKey"),
          eb.cast<number>(eb.fn.count("cs.source").distinct(), "integer").as("sourceCount"),
          eb
            .cast<number>(
              eb.fn
                // oxlint-disable-next-line promise/prefer-await-to-then -- Kysely CaseBuilder.then(), not Promise
                .count(eb.case().when("cs.checkedAt", "is", null).then(eb.ref("cs.id")).end())
                .distinct(),
              "integer",
            )
            .as("uncheckedCardCount"),
          eb
            .cast<number>(
              eb.fn
                .count(
                  eb
                    .case()
                    .when(eb.and([eb("ps.checkedAt", "is", null), eb("ps.id", "is not", null)]))
                    // oxlint-disable-next-line promise/prefer-await-to-then -- Kysely CaseBuilder.then(), not Promise
                    .then(eb.ref("ps.id"))
                    .end(),
                )
                .distinct(),
              "integer",
            )
            .as("uncheckedPrintingCount"),
          eb.fn.agg<boolean>("bool_or", [eb("cs.source", "=", "gallery")]).as("hasGallery"),
          eb.fn
            .min(eb.cast<string>(eb.ref("s.releasedAt"), "text"))
            .filterWhere("s.releasedAt", "is not", null)
            .as("minReleasedAt"),
          eb.fn.min("s.slug").filterWhere("s.releasedAt", "is not", null).as("releasedSetSlug"),
          eb.fn
            .agg<boolean>("bool_or", [
              eb.and([eb("s.id", "is not", null), eb("s.releasedAt", "is", null)]),
            ])
            .as("hasKnownSet"),
          eb.fn
            .agg<boolean>("bool_or", [
              eb.and([eb("ps.id", "is not", null), eb("s.id", "is", null)]),
            ])
            .as("hasUnknownSet"),
        ])
        .where(notIgnoredCard("cs"))
        .where(notHiddenSource("cs"))
        .groupBy(sql`COALESCE((${rcid})::text, cs.norm_name)`)
        .execute();
      return rows as unknown as GroupedSourceRow[];
    },

    /** @returns Cards that have no card_sources (orphans). */
    listOrphanCards(
      excludeIds: string[],
    ): Promise<Pick<Selectable<CardsTable>, "id" | "slug" | "name">[]> {
      let query = db.selectFrom("cards as c").select(["c.id", "c.slug", "c.name"]);
      if (excludeIds.length > 0) {
        query = query.where("c.id", "not in", excludeIds);
      }
      return query.execute();
    },

    /** @returns Set release info for orphan cards via their printings. */
    listOrphanPrintingSetInfo(
      cardIds: string[],
    ): Promise<{ cardId: string; slug: string; releasedAt: string | null }[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings as p")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "s.slug", "s.releasedAt"])
        .where("p.cardId", "in", cardIds)
        .execute();
    },

    /** @returns Card suggestions for unmatched groups (by normalized card name). */
    listSuggestionsByNormName(
      normNames: string[],
    ): Promise<{ id: string; slug: string; name: string; norm: string }[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cards as c")
        .select(["c.id", "c.slug", "c.name", "c.normName as norm"])
        .where("c.normName", "in", normNames)
        .execute() as Promise<{ id: string; slug: string; name: string; norm: string }[]>;
    },

    /** @returns Alias-based card suggestions for remaining unmatched groups. */
    listAliasSuggestions(
      normNames: string[],
    ): Promise<{ id: string; slug: string; name: string; norm: string }[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardNameAliases as cna")
        .innerJoin("cards as c", "c.id", "cna.cardId")
        .select(["c.id", "c.slug", "c.name", "cna.normName as norm"])
        .where("cna.normName", "in", normNames)
        .execute() as Promise<{ id: string; slug: string; name: string; norm: string }[]>;
    },

    /** @returns Printing sourceId rows for matched cards, ordered by sourceId. */
    listPrintingSourceIds(cardIds: string[]): Promise<{ cardId: string; sourceId: string }[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings")
        .select(["cardId", "sourceId"])
        .where("cardId", "in", cardIds)
        .orderBy("sourceId")
        .execute();
    },

    /** @returns Unlinked printing_sources (candidates) for matched cards. */
    listCandidateSourceIds(
      normNames: string[],
    ): Promise<{ cardId: string | null; sourceId: string }[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs", "cs.id", "ps.cardSourceId")
        .select([resolveCardId("cs").as("cardId"), "ps.sourceId"])
        .where("cs.normName", "in", normNames)
        .where("ps.printingId", "is", null)
        .orderBy("ps.sourceId")
        .execute() as Promise<{ cardId: string | null; sourceId: string }[]>;
    },

    /** @returns Card IDs that have at least one printing without an active front image. */
    listCardIdsWithMissingImages(cardIds: string[]): Promise<{ cardId: string }[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings as p")
        .select("p.cardId")
        .where("p.cardId", "in", cardIds)
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("printingImages as pi")
                .select(sql.lit(1).as("one"))
                .whereRef("pi.printingId", "=", "p.id")
                .where("pi.face", "=", "front")
                .where("pi.isActive", "=", true),
            ),
          ),
        )
        .groupBy("p.cardId")
        .execute();
    },

    /** @returns Printing source IDs for unmatched groups, ordered by sourceId. */
    listPendingSourceIds(normNames: string[]): Promise<{ norm: string; sourceId: string }[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs", "cs.id", "ps.cardSourceId")
        .select(["cs.normName as norm", "ps.sourceId"])
        .where("cs.normName", "in", normNames)
        .orderBy("ps.sourceId")
        .execute() as Promise<{ norm: string; sourceId: string }[]>;
    },

    // ── GET /:cardId — detail sub-queries ─────────────────────────────────

    /** @returns A single card by slug, or `undefined`. */
    cardBySlug(slug: string): Promise<Selectable<CardsTable> | undefined> {
      return db.selectFrom("cards").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns Name aliases for a card. */
    cardNameAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

    /** @returns Printing sourceIds for a card. */
    printingSourceIdsForCard(cardId: string): Promise<{ sourceId: string }[]> {
      return db.selectFrom("printings").select("sourceId").where("cardId", "=", cardId).execute();
    },

    /** @returns Card sources by normalized names, excluding ignored. Ordered by source. */
    cardSourcesByNormNames(normNames: string[]): Promise<Selectable<CardSourcesTable>[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("cardSources")
        .selectAll()
        .where("cardSources.normName", "in", normNames)
        .where(notIgnoredCard("cardSources"))
        .where(notHiddenSource("cardSources"))
        .orderBy("source")
        .execute();
    },

    /**
     * @returns Card sources matching by normalized name OR by printing source ID match.
     * Excludes ignored. Ordered by source.
     */
    cardSourcesByNormNamesOrPrintingSourceIds(
      normNames: string[],
      printingSourceIds: string[],
    ): Promise<Selectable<CardSourcesTable>[]> {
      return db
        .selectFrom("cardSources")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("cardSources.normName", "in", normNames),
            eb.exists(
              eb
                .selectFrom("printingSources as ps_match")
                .select(sql.lit(1).as("x"))
                .whereRef("ps_match.cardSourceId", "=", "cardSources.id")
                .where("ps_match.sourceId", "in", printingSourceIds),
            ),
          ]),
        )
        .where(notIgnoredCard("cardSources"))
        .where(notHiddenSource("cardSources"))
        .orderBy("source")
        .execute();
    },

    /** @returns All printings for a card, with promo type slug resolved. */
    printingsForCard(cardId: string) {
      return db
        .selectFrom("printings")
        .leftJoin("promoTypes", "promoTypes.id", "printings.promoTypeId")
        .selectAll("printings")
        .select("promoTypes.slug as promoTypeSlug")
        .where("printings.cardId", "=", cardId)
        .execute();
    },

    /**
     * @returns Printing sources for given card source IDs, excluding ignored.
     * Ordered by setId, finish, isSigned, sourceId.
     */
    printingSourcesForCardSources(
      cardSourceIds: string[],
    ): Promise<Selectable<PrintingSourcesTable>[]> {
      if (cardSourceIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs_parent", "cs_parent.id", "ps.cardSourceId")
        .selectAll("ps")
        .where("ps.cardSourceId", "in", cardSourceIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .orderBy("ps.setId")
        .orderBy("ps.finish")
        .orderBy("ps.isSigned")
        .orderBy("ps.sourceId")
        .execute();
    },

    /** @returns Printing images for given printing IDs, ordered by createdAt. */
    printingImagesForPrintings(printingIds: string[]): Promise<Selectable<PrintingImagesTable>[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingImages")
        .selectAll()
        .where("printingId", "in", printingIds)
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** @returns Set UUID → slug mappings. */
    setSlugsByIds(setIds: string[]): Promise<{ id: string; slug: string }[]> {
      if (setIds.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("sets").select(["id", "slug"]).where("id", "in", setIds).execute();
    },

    // ── GET /new/:name — unmatched detail sub-queries ─────────────────────

    /** @returns Card sources by exact normalized name, excluding ignored. Ordered by source. */
    cardSourcesByNormName(normName: string): Promise<Selectable<CardSourcesTable>[]> {
      return db
        .selectFrom("cardSources")
        .selectAll()
        .where("cardSources.normName", "=", normName)
        .where(notIgnoredCard("cardSources"))
        .where(notHiddenSource("cardSources"))
        .orderBy("source")
        .execute();
    },

    /**
     * @returns Printing sources for unmatched detail, excluding ignored.
     * Ordered by collectorNumber, sourceId.
     */
    printingSourcesForUnmatched(
      cardSourceIds: string[],
    ): Promise<Selectable<PrintingSourcesTable>[]> {
      if (cardSourceIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs_parent", "cs_parent.id", "ps.cardSourceId")
        .selectAll("ps")
        .where("ps.cardSourceId", "in", cardSourceIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .orderBy("ps.collectorNumber")
        .orderBy("ps.sourceId")
        .execute();
    },

    // ── GET /export ───────────────────────────────────────────────────────

    /** @returns All cards with all columns, ordered by name. */
    exportCards(): Promise<Selectable<CardsTable>[]> {
      return db.selectFrom("cards").selectAll().orderBy("name").execute();
    },

    /** @returns All printings with set slug/name and active front image URLs. */
    exportPrintings(): Promise<ExportPrintingRow[]> {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .leftJoin("printingImages", (jb) =>
          jb
            .onRef("printingImages.printingId", "=", "printings.id")
            .on("printingImages.face", "=", "front")
            .on("printingImages.isActive", "=", true),
        )
        .selectAll("printings")
        .select([
          "sets.slug as setSlug",
          "sets.name as setName",
          "printingImages.rehostedUrl",
          "printingImages.originalUrl",
        ])
        .orderBy("printings.setId")
        .orderBy("printings.collectorNumber")
        .orderBy("printings.artVariant")
        .orderBy("printings.finish")
        .execute() as Promise<ExportPrintingRow[]>;
    },
  };
}
