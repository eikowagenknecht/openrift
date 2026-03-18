import type { Kysely, Selectable, SqlBool } from "kysely";
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
 * @returns SQL boolean expression for NOT EXISTS subquery
 */
function notIgnoredCard(alias: string) {
  return sql<SqlBool>`NOT EXISTS (
    SELECT 1 FROM ignored_card_sources ics
    WHERE ics.source = ${sql.ref(`${alias}.source`)}
      AND ics.source_entity_id = ${sql.ref(`${alias}.source_entity_id`)}
  )`;
}

/**
 * Reusable WHERE filter: exclude printing_sources that appear in ignored_printing_sources.
 * @param alias — the printing_sources table alias used in the query (e.g. "ps", "printingSources")
 * @param csAlias — the card_sources table alias to resolve the source name
 * @returns SQL boolean expression for NOT EXISTS subquery
 */
function notIgnoredPrinting(alias: string, csAlias: string) {
  return sql<SqlBool>`NOT EXISTS (
    SELECT 1 FROM ignored_printing_sources ips
    WHERE ips.source = ${sql.ref(`${csAlias}.source`)}
      AND ips.source_entity_id = ${sql.ref(`${alias}.source_entity_id`)}
      AND (ips.finish IS NULL OR ips.finish = ${sql.ref(`${alias}.finish`)})
  )`;
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

    /** @returns Distinct source names, ordered alphabetically. */
    async distinctSourceNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("cardSources")
        .select("source")
        .distinct()
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
    async listGroupedSources(
      filter: string,
      source?: string,
      set?: string,
    ): Promise<GroupedSourceRow[]> {
      const rcid = resolveCardId("cs");
      let query = db
        .selectFrom("cardSources as cs")
        .leftJoin("printingSources as ps", "ps.cardSourceId", "cs.id")
        .leftJoin("sets as s", "s.slug", "ps.setId")
        .leftJoin("cards as c", (jb) => jb.on(sql`c.id = (${rcid})`))
        // raw sql: could use fn.count(eb.case()...).distinct() but the sql`` form is
        // much more readable for these multi-condition conditional aggregates
        .select([
          sql<string | null>`max((${rcid})::text)`.as("cardId"),
          sql<string | null>`max(c.slug)`.as("cardSlug"),
          sql<string>`COALESCE(max(c.name), min(cs.name))`.as("name"),
          sql<string>`COALESCE((${rcid})::text, cs.norm_name)`.as("groupKey"),
          sql<number>`count(DISTINCT cs.source)::int`.as("sourceCount"),
          sql<number>`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END)::int`.as(
            "uncheckedCardCount",
          ),
          sql<number>`count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)::int`.as(
            "uncheckedPrintingCount",
          ),
          sql<boolean>`bool_or(cs.source = 'gallery')`.as("hasGallery"),
          sql<string | null>`min(s.released_at::text) FILTER (WHERE s.released_at IS NOT NULL)`.as(
            "minReleasedAt",
          ),
          sql<string | null>`min(s.slug) FILTER (WHERE s.released_at IS NOT NULL)`.as(
            "releasedSetSlug",
          ),
          sql<boolean>`bool_or(s.id IS NOT NULL AND s.released_at IS NULL)`.as("hasKnownSet"),
          sql<boolean>`bool_or(ps.id IS NOT NULL AND s.id IS NULL)`.as("hasUnknownSet"),
        ])
        .where(notIgnoredCard("cs"))
        .groupBy(sql`COALESCE((${rcid})::text, cs.norm_name)`);

      if (source) {
        const rcid2 = resolveCardId("cs2");
        query = query.where((eb) =>
          eb.exists(
            eb
              .selectFrom("cardSources as cs2")
              .select(sql.lit(1).as("x"))
              .where("cs2.source", "=", source)
              .where(
                sql<SqlBool>`COALESCE((${rcid2})::text, cs2.norm_name) = COALESCE((${rcid})::text, cs.norm_name)`,
              ),
          ),
        );
      }

      if (set) {
        query = query.where((eb) =>
          eb.or([
            eb.exists(
              eb
                .selectFrom("printingSources as ps2")
                .select(sql.lit(1).as("x"))
                .where("ps2.setId", "=", set)
                .whereRef("ps2.cardSourceId", "=", "cs.id"),
            ),
            eb.exists(
              eb
                .selectFrom("printings as p2")
                .innerJoin("sets as s2", "s2.id", "p2.setId")
                .select(sql.lit(1).as("x"))
                .where("s2.slug", "=", set)
                .where(sql<SqlBool>`p2.card_id = (${rcid})`),
            ),
          ]),
        );
      }

      if (filter === "unchecked") {
        // raw sql: arithmetic on two conditional aggregates in HAVING — clearer as raw sql
        query = query.having(
          sql`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END) +
            count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`,
          ">",
          0,
        );
      } else if (filter === "unmatched") {
        query = query.where(sql<SqlBool>`(${rcid}) IS NULL`);
      } else if (filter === "active") {
        query = query.where(sql<SqlBool>`(${rcid}) IS NOT NULL`);
      }

      const rows = await query.execute();
      return rows as unknown as GroupedSourceRow[];
    },

    /** @returns Cards that have no card_sources (orphans), optionally filtered to a set. */
    listOrphanCards(
      excludeIds: string[],
      set?: string,
    ): Promise<Pick<Selectable<CardsTable>, "id" | "slug" | "name">[]> {
      let query = db.selectFrom("cards as c").select(["c.id", "c.slug", "c.name"]);
      if (excludeIds.length > 0) {
        query = query.where("c.id", "not in", excludeIds);
      }
      if (set) {
        query = query.where((eb) =>
          eb.exists(
            eb
              .selectFrom("printings as p")
              .innerJoin("sets as s", "s.id", "p.setId")
              .select(sql.lit(1).as("x"))
              .where("s.slug", "=", set)
              .whereRef("p.cardId", "=", "c.id"),
          ),
        );
      }
      return query.execute();
    },

    /** @returns Set release info for orphan cards via their printings. */
    listOrphanPrintingSetInfo(
      cardIds: string[],
    ): Promise<{ cardId: string; slug: string; releasedAt: string | Date | null }[]> {
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
        .orderBy("source")
        .execute();
    },

    /** @returns All printings for a card. */
    printingsForCard(cardId: string): Promise<Selectable<PrintingsTable>[]> {
      return db.selectFrom("printings").selectAll().where("cardId", "=", cardId).execute();
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
