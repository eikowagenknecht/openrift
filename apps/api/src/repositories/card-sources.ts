import type { SourceStatsResponse } from "@openrift/shared";
import type { ExpressionBuilder, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardNameAliasesTable,
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

/** @see SourceStatsResponse — shared contract for GET /card-sources/source-stats */

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

    /** @returns All cards with fields needed for the card source list. */
    listCardsForSourceList(): Promise<
      Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "normName">[]
    > {
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name", "normName"])
        .orderBy("slug")
        .execute();
    },

    /** @returns All card name aliases — e.g. { normName: "firebal", cardId: "uuid-123" } */
    listAliasesForSourceList(): Promise<
      Pick<Selectable<CardNameAliasesTable>, "normName" | "cardId">[]
    > {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

    /** @returns All card sources with fields needed for the card source list. */
    listCardSourcesForSourceList(): Promise<
      Pick<Selectable<CardSourcesTable>, "id" | "normName" | "name" | "source" | "checkedAt">[]
    > {
      return db
        .selectFrom("cardSources")
        .select(["id", "normName", "name", "source", "checkedAt"])
        .where(notIgnoredCard("cardSources"))
        .where(notHiddenSource("cardSources"))
        .orderBy("name")
        .execute();
    },

    /** @returns All printings with fields needed for the card source list. */
    listPrintingsForSourceList(): Promise<
      Pick<Selectable<PrintingsTable>, "cardId" | "sourceId">[]
    > {
      return db.selectFrom("printings").select(["cardId", "sourceId"]).execute();
    },

    /** @returns Cards where at least one printing has no active front-face image. */
    listCardsWithMissingImages(): Promise<{ cardId: string; slug: string; name: string }[]> {
      return db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select(["p.cardId", "c.slug", "c.name"])
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
        .groupBy(["p.cardId", "c.slug", "c.name"])
        .orderBy("c.name")
        .execute();
    },

    /** @returns All printing sources with fields needed for the card source list. */
    listPrintingSourcesForSourceList(): Promise<
      Pick<Selectable<PrintingSourcesTable>, "cardSourceId" | "sourceId" | "checkedAt">[]
    > {
      return db
        .selectFrom("printingSources")
        .select(["cardSourceId", "sourceId", "checkedAt"])
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
    async sourceStats(): Promise<SourceStatsResponse[]> {
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

    /** @returns Unlinked printing_sources with grouping fields for matched cards. */
    listUnlinkedPrintingSourcesForCards(normNames: string[]): Promise<
      {
        cardId: string;
        sourceId: string;
        groupKey: string;
        setId: string | null;
        rarity: string | null;
        finish: string | null;
        artVariant: string | null;
        isSigned: boolean | null;
        promoTypeId: string | null;
      }[]
    > {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs", "cs.id", "ps.cardSourceId")
        .select([
          resolveCardId("cs").as("cardId"),
          "ps.sourceId",
          "ps.groupKey",
          "ps.setId",
          "ps.rarity",
          "ps.finish",
          "ps.artVariant",
          "ps.isSigned",
          "ps.promoTypeId",
        ])
        .where("cs.normName", "in", normNames)
        .where("ps.printingId", "is", null)
        .where(notHiddenSource("cs"))
        .execute() as Promise<
        {
          cardId: string;
          sourceId: string;
          groupKey: string;
          setId: string | null;
          rarity: string | null;
          finish: string | null;
          artVariant: string | null;
          isSigned: boolean | null;
          promoTypeId: string | null;
        }[]
      >;
    },

    /** @returns Accepted printings with matching fields for given card IDs. Set ID returned as slug. */
    listPrintingsForCards(cardIds: string[]): Promise<
      {
        id: string;
        cardId: string;
        setSlug: string | null;
        rarity: string;
        finish: string;
        artVariant: string;
        isSigned: boolean;
        promoTypeId: string | null;
      }[]
    > {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings")
        .leftJoin("sets", "sets.id", "printings.setId")
        .select([
          "printings.id",
          "printings.cardId",
          "sets.slug as setSlug",
          "printings.rarity",
          "printings.finish",
          "printings.artVariant",
          "printings.isSigned",
          "printings.promoTypeId",
        ])
        .where("printings.cardId", "in", cardIds)
        .execute() as Promise<
        {
          id: string;
          cardId: string;
          setSlug: string | null;
          rarity: string;
          finish: string;
          artVariant: string;
          isSigned: boolean;
          promoTypeId: string | null;
        }[]
      >;
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

    /** @returns Card detail fields for the card source detail page. */
    cardForDetail(
      slug: string,
    ): Promise<
      | Pick<
          Selectable<CardsTable>,
          | "id"
          | "slug"
          | "name"
          | "normName"
          | "type"
          | "superTypes"
          | "domains"
          | "might"
          | "energy"
          | "power"
          | "mightBonus"
          | "keywords"
          | "rulesText"
          | "effectText"
          | "tags"
        >
      | undefined
    > {
      return db
        .selectFrom("cards")
        .select([
          "id",
          "slug",
          "name",
          "normName",
          "type",
          "superTypes",
          "domains",
          "might",
          "energy",
          "power",
          "mightBonus",
          "keywords",
          "rulesText",
          "effectText",
          "tags",
        ])
        .where("slug", "=", slug)
        .executeTakeFirst();
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

    /** @returns Printings for detail page, without timestamps. */
    printingsForDetail(cardId: string) {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "slug",
          "cardId",
          "setId",
          "sourceId",
          "collectorNumber",
          "rarity",
          "artVariant",
          "isSigned",
          "promoTypeId",
          "finish",
          "artist",
          "publicCode",
          "printedRulesText",
          "printedEffectText",
          "flavorText",
          "comment",
        ])
        .where("cardId", "=", cardId)
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

    /** @returns Printing sources for detail page, without timestamps. */
    printingSourcesForDetail(
      cardSourceIds: string[],
    ): Promise<
      Pick<
        Selectable<PrintingSourcesTable>,
        | "id"
        | "cardSourceId"
        | "printingId"
        | "sourceId"
        | "setId"
        | "setName"
        | "collectorNumber"
        | "rarity"
        | "artVariant"
        | "isSigned"
        | "promoTypeId"
        | "finish"
        | "artist"
        | "publicCode"
        | "printedRulesText"
        | "printedEffectText"
        | "imageUrl"
        | "flavorText"
        | "sourceEntityId"
        | "extraData"
        | "groupKey"
        | "checkedAt"
      >[]
    > {
      if (cardSourceIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs_parent", "cs_parent.id", "ps.cardSourceId")
        .select([
          "ps.id",
          "ps.cardSourceId",
          "ps.printingId",
          "ps.sourceId",
          "ps.setId",
          "ps.setName",
          "ps.collectorNumber",
          "ps.rarity",
          "ps.artVariant",
          "ps.isSigned",
          "ps.promoTypeId",
          "ps.finish",
          "ps.artist",
          "ps.publicCode",
          "ps.printedRulesText",
          "ps.printedEffectText",
          "ps.imageUrl",
          "ps.flavorText",
          "ps.sourceEntityId",
          "ps.extraData",
          "ps.groupKey",
          "ps.checkedAt",
        ])
        .where("ps.cardSourceId", "in", cardSourceIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .orderBy("ps.setId")
        .orderBy("ps.finish")
        .orderBy("ps.isSigned")
        .orderBy("ps.sourceId")
        .execute();
    },

    /** @returns Promo type ID → slug mapping for given IDs. */
    promoTypeSlugsByIds(ids: string[]): Promise<{ id: string; slug: string }[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("promoTypes").select(["id", "slug"]).where("id", "in", ids).execute();
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

    /** @returns Printing images for detail page, only fields the frontend needs. */
    printingImagesForDetail(
      printingIds: string[],
    ): Promise<
      Pick<
        Selectable<PrintingImagesTable>,
        "id" | "printingId" | "face" | "source" | "originalUrl" | "rehostedUrl" | "isActive"
      >[]
    > {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingImages")
        .select(["id", "printingId", "face", "source", "originalUrl", "rehostedUrl", "isActive"])
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

    /** @returns Set slug + release date for given IDs. */
    setInfoByIds(
      setIds: string[],
    ): Promise<{ id: string; slug: string; releasedAt: string | null }[]> {
      if (setIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("sets")
        .select(["id", "slug", "releasedAt"])
        .where("id", "in", setIds)
        .execute();
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

    /** @returns Card sources for detail page, explicit columns. */
    cardSourcesForDetail(
      normName: string,
    ): Promise<
      Pick<
        Selectable<CardSourcesTable>,
        | "id"
        | "source"
        | "name"
        | "type"
        | "superTypes"
        | "domains"
        | "might"
        | "energy"
        | "power"
        | "mightBonus"
        | "rulesText"
        | "effectText"
        | "tags"
        | "sourceId"
        | "sourceEntityId"
        | "extraData"
        | "checkedAt"
      >[]
    > {
      return db
        .selectFrom("cardSources")
        .select([
          "id",
          "source",
          "name",
          "type",
          "superTypes",
          "domains",
          "might",
          "energy",
          "power",
          "mightBonus",
          "rulesText",
          "effectText",
          "tags",
          "sourceId",
          "sourceEntityId",
          "extraData",
          "checkedAt",
        ])
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
