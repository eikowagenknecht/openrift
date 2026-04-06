import type { ProviderStatsResponse } from "@openrift/shared";
import type { ExpressionBuilder, Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  CardNameAliasesTable,
  CandidateCardsTable,
  CardsTable,
  Database,
  PrintingImagesTable,
  CandidatePrintingsTable,
  PrintingsTable,
} from "../db/index.js";
import { domainsArray, resolveCardId, superTypesArray } from "./query-helpers.js";

/**
 * Reusable WHERE filter: exclude candidate_cards that appear in ignored_candidate_cards.
 * @param alias — the candidate_cards table alias used in the query (e.g. "cs", "candidateCards")
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notIgnoredCard(alias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("ignoredCandidateCards as ics")
          .select(sql.lit(1).as("x"))
          .where("ics.provider", "=", sql<string>`${sql.ref(`${alias}.provider`)}`)
          .where("ics.externalId", "=", sql<string>`${sql.ref(`${alias}.externalId`)}`),
      ),
    );
}

/**
 * Reusable WHERE filter: exclude candidate_cards whose provider is hidden in provider_settings.
 * @param alias — the candidate_cards table alias used in the query (e.g. "cs", "candidateCards")
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notHiddenSource(alias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("providerSettings as ss")
          .select(sql.lit(1).as("x"))
          .where("ss.provider", "=", sql<string>`${sql.ref(`${alias}.provider`)}`)
          .where("ss.isHidden", "=", true),
      ),
    );
}

/**
 * Reusable WHERE filter: exclude candidate_printings that appear in ignored_candidate_printings.
 * @param alias — the candidate_printings table alias used in the query (e.g. "ps", "candidatePrintings")
 * @param csAlias — the candidate_cards table alias to resolve the provider name
 * @returns Expression builder callback for NOT EXISTS subquery
 */
function notIgnoredPrinting(alias: string, csAlias: string) {
  return (eb: ExpressionBuilder<Database, any>) =>
    eb.not(
      eb.exists(
        eb
          .selectFrom("ignoredCandidatePrintings as ips")
          .select(sql.lit(1).as("x"))
          .where("ips.provider", "=", sql<string>`${sql.ref(`${csAlias}.provider`)}`)
          .where("ips.externalId", "=", sql<string>`${sql.ref(`${alias}.externalId`)}`)
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

/** @see ProviderStatsResponse — shared contract for GET /candidates/provider-stats */

/** Row returned by `exportPrintings`. */
interface ExportPrintingRow extends Selectable<PrintingsTable> {
  setSlug: string;
  setName: string;
  imageId: string | null;
  rehostedUrl: string | null;
  originalUrl: string | null;
}

/**
 * Read-only queries for the candidate-cards admin UI.
 *
 * Each method performs a single database query (or returns early for empty
 * inputs). Response shaping and multi-query orchestration live in the
 * service layer (`services/card-source-queries.ts`).
 *
 * @returns An object with candidate-card query methods bound to the given `db`.
 */
export function candidateCardsRepo(db: Kysely<Database>) {
  return {
    // ── Simple list endpoints ─────────────────────────────────────────────

    /** @returns Lightweight card list (id, slug, name, type) ordered by slug. */
    listAllCards(): Promise<Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "type">[]> {
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name", "type"])
        .orderBy("slug")
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

    /** @returns All candidate cards with fields needed for the card source list. */
    listCandidateCardsForSourceList(): Promise<
      Pick<Selectable<CandidateCardsTable>, "id" | "normName" | "name" | "provider" | "checkedAt">[]
    > {
      return db
        .selectFrom("candidateCards")
        .select(["id", "normName", "name", "provider", "checkedAt"])
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("name")
        .execute();
    },

    /** @returns All printings with fields needed for the card source list. */
    listPrintingsForSourceList(): Promise<
      Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "language">[]
    > {
      return db.selectFrom("printings").select(["cardId", "shortCode", "language"]).execute();
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

    /** @returns All candidate printings with fields needed for the card source list. */
    listCandidatePrintingsForSourceList(): Promise<
      Pick<
        Selectable<CandidatePrintingsTable>,
        "candidateCardId" | "shortCode" | "checkedAt" | "printingId" | "language"
      >[]
    > {
      return db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs", "cs.id", "ps.candidateCardId")
        .select([
          "ps.candidateCardId",
          "ps.shortCode",
          "ps.checkedAt",
          "ps.printingId",
          "ps.language",
        ])
        .where(notIgnoredPrinting("ps", "cs"))
        .where(notHiddenSource("cs"))
        .execute();
    },

    /** @returns Distinct artist names from published printings, ordered alphabetically. */
    async distinctArtists(): Promise<string[]> {
      const rows = await db
        .selectFrom("printings")
        .select("artist")
        .distinct()
        .orderBy("artist")
        .execute();
      return rows.map((r) => r.artist);
    },

    /** @returns Distinct provider names, ordered alphabetically. */
    async distinctProviderNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("candidateCards")
        .select("provider")
        .distinct()
        .orderBy("provider")
        .execute();
      return rows.map((r) => r.provider);
    },

    /** @returns Per-provider card count, printing count, and last-updated timestamp. */
    async providerStats(): Promise<ProviderStatsResponse[]> {
      const rows = await db
        .selectFrom("candidateCards as cs")
        .leftJoin("candidatePrintings as ps", "ps.candidateCardId", "cs.id")
        .select((eb) => [
          "cs.provider" as const,
          eb.cast<number>(eb.fn.count("cs.name").distinct(), "integer").as("cardCount"),
          eb.cast<number>(eb.fn.count("ps.id").distinct(), "integer").as("printingCount"),
          sql<string>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
            "lastUpdated",
          ),
        ])
        .where(notIgnoredCard("cs"))
        .groupBy("cs.provider")
        .orderBy("cs.provider")
        .execute();

      return rows.map((r) => ({
        provider: r.provider,
        cardCount: r.cardCount,
        printingCount: r.printingCount,
        lastUpdated: r.lastUpdated,
      }));
    },

    // ── GET / — grouped list sub-queries ──────────────────────────────────

    /** @returns Cards that have no candidate_cards (orphans). */
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

    /** @returns Printing shortCode rows for matched cards, ordered by shortCode. */
    listPrintingShortCodes(cardIds: string[]): Promise<{ cardId: string; shortCode: string }[]> {
      if (cardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printings")
        .select(["cardId", "shortCode"])
        .where("cardId", "in", cardIds)
        .orderBy("shortCode")
        .execute();
    },

    /** @returns Unlinked candidate_printings with grouping fields for matched cards. */
    listUnlinkedCandidatePrintingsForCards(normNames: string[]): Promise<
      {
        cardId: string;
        shortCode: string;
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
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs", "cs.id", "ps.candidateCardId")
        .select([
          resolveCardId("cs").as("cardId"),
          "ps.shortCode",
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
          shortCode: string;
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

    /** @returns Candidate printing shortCodes for unmatched groups, ordered by shortCode. */
    listPendingShortCodes(normNames: string[]): Promise<{ norm: string; shortCode: string }[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs", "cs.id", "ps.candidateCardId")
        .select(["cs.normName as norm", "ps.shortCode"])
        .where("cs.normName", "in", normNames)
        .orderBy("ps.shortCode")
        .execute() as Promise<{ norm: string; shortCode: string }[]>;
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
      | (Pick<
          Selectable<CardsTable>,
          | "id"
          | "slug"
          | "name"
          | "normName"
          | "type"
          | "might"
          | "energy"
          | "power"
          | "mightBonus"
          | "keywords"
          | "tags"
          | "comment"
        > & { domains: string[]; superTypes: string[] })
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
          "might",
          "energy",
          "power",
          "mightBonus",
          "keywords",
          "tags",
          "comment",
          domainsArray("cards.id").as("domains"),
          superTypesArray("cards.id").as("superTypes"),
        ])
        .where("slug", "=", slug)
        .executeTakeFirst() as Promise<any>;
    },

    /** @returns Name aliases for a card. */
    cardNameAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

    /** @returns Card errata for a card, or null. */
    async cardErrataForDetail(cardId: string) {
      return (
        (await db
          .selectFrom("cardErrata")
          .select([
            "correctedRulesText",
            "correctedEffectText",
            "source",
            "sourceUrl",
            "effectiveDate",
          ])
          .where("cardId", "=", cardId)
          .executeTakeFirst()) ?? null
      );
    },

    /** @returns Printing shortCodes for a card. */
    printingShortCodesForCard(cardId: string): Promise<{ shortCode: string }[]> {
      return db.selectFrom("printings").select("shortCode").where("cardId", "=", cardId).execute();
    },

    /** @returns Candidate cards by normalized names, excluding ignored. Ordered by provider. */
    candidateCardsByNormNames(normNames: string[]): Promise<Selectable<CandidateCardsTable>[]> {
      if (normNames.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidateCards")
        .selectAll()
        .where("candidateCards.normName", "in", normNames)
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("provider")
        .execute();
    },

    /**
     * @returns Candidate cards matching by normalized name OR by candidate printing shortCode match.
     * Excludes ignored. Ordered by provider.
     */
    candidateCardsByNormNamesOrPrintingShortCodes(
      normNames: string[],
      printingShortCodes: string[],
    ): Promise<Selectable<CandidateCardsTable>[]> {
      return db
        .selectFrom("candidateCards")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("candidateCards.normName", "in", normNames),
            eb.exists(
              eb
                .selectFrom("candidatePrintings as ps_match")
                .select(sql.lit(1).as("x"))
                .whereRef("ps_match.candidateCardId", "=", "candidateCards.id")
                .where("ps_match.shortCode", "in", printingShortCodes),
            ),
          ]),
        )
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("provider")
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
        .orderBy("printings.setId")
        .orderBy("printings.finish")
        .orderBy("printings.isSigned")
        .orderBy("printings.shortCode")
        .execute();
    },

    /** @returns Printings for detail page, without timestamps. */
    printingsForDetail(cardId: string) {
      return db
        .selectFrom("printings")
        .select([
          "id",
          "cardId",
          "setId",
          "shortCode",
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
          "printedName",
          "language",
          "comment",
        ])
        .where("cardId", "=", cardId)
        .orderBy("setId")
        .orderBy("finish")
        .orderBy("isSigned")
        .orderBy("shortCode")
        .execute();
    },

    /**
     * @returns Candidate printings for given candidate card IDs, excluding ignored.
     * Ordered by setId, finish, isSigned, shortCode.
     */
    candidatePrintingsForCandidateCards(
      candidateCardIds: string[],
    ): Promise<Selectable<CandidatePrintingsTable>[]> {
      if (candidateCardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs_parent", "cs_parent.id", "ps.candidateCardId")
        .selectAll("ps")
        .where("ps.candidateCardId", "in", candidateCardIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .orderBy("ps.setId")
        .orderBy("ps.finish")
        .orderBy("ps.isSigned")
        .orderBy("ps.shortCode")
        .execute();
    },

    /** @returns Candidate printings for detail page, without timestamps. */
    candidatePrintingsForDetail(
      candidateCardIds: string[],
    ): Promise<
      Pick<
        Selectable<CandidatePrintingsTable>,
        | "id"
        | "candidateCardId"
        | "printingId"
        | "shortCode"
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
        | "language"
        | "printedName"
        | "externalId"
        | "extraData"
        | "checkedAt"
      >[]
    > {
      if (candidateCardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs_parent", "cs_parent.id", "ps.candidateCardId")
        .select([
          "ps.id",
          "ps.candidateCardId",
          "ps.printingId",
          "ps.shortCode",
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
          "ps.language",
          "ps.printedName",
          "ps.externalId",
          "ps.extraData",
          "ps.checkedAt",
        ])
        .where("ps.candidateCardId", "in", candidateCardIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .where(notHiddenSource("cs_parent"))
        .orderBy("ps.setId")
        .orderBy("ps.finish")
        .orderBy("ps.isSigned")
        .orderBy("ps.shortCode")
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
        "id" | "printingId" | "face" | "provider" | "originalUrl" | "rehostedUrl" | "isActive"
      >[]
    > {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingImages")
        .select(["id", "printingId", "face", "provider", "originalUrl", "rehostedUrl", "isActive"])
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
    setInfoByIds(setIds: string[]): Promise<
      {
        id: string;
        slug: string;
        name: string;
        releasedAt: string | null;
        printedTotal: number | null;
      }[]
    > {
      if (setIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("sets")
        .select(["id", "slug", "name", "releasedAt", "printedTotal"])
        .where("id", "in", setIds)
        .execute();
    },

    /** @returns Printed totals for sets identified by slug. */
    setPrintedTotalBySlugs(
      slugs: string[],
    ): Promise<{ slug: string; printedTotal: number | null }[]> {
      if (slugs.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("sets")
        .select(["slug", "printedTotal"])
        .where("slug", "in", slugs)
        .execute();
    },

    // ── GET /new/:name — unmatched detail sub-queries ─────────────────────

    /** @returns Candidate cards by normName and provider, unfiltered (no ignore/hidden exclusions). */
    candidateCardsByNormNameAndProvider(
      normName: string,
      provider: string,
    ): Promise<Selectable<CandidateCardsTable>[]> {
      return db
        .selectFrom("candidateCards")
        .selectAll()
        .where("normName", "=", normName)
        .where("provider", "=", provider)
        .execute();
    },

    /** @returns All candidate printings for given candidate card IDs, unfiltered (no ignore/hidden exclusions). */
    allCandidatePrintingsForCandidateCards(
      candidateCardIds: string[],
    ): Promise<Selectable<CandidatePrintingsTable>[]> {
      if (candidateCardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("candidateCardId", "in", candidateCardIds)
        .execute();
    },

    /** @returns Candidate cards by exact normalized name, excluding ignored. Ordered by provider. */
    candidateCardsByNormName(normName: string): Promise<Selectable<CandidateCardsTable>[]> {
      return db
        .selectFrom("candidateCards")
        .selectAll()
        .where("candidateCards.normName", "=", normName)
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("provider")
        .execute();
    },

    /** @returns Candidate cards for detail page, explicit columns. */
    candidateCardsForDetail(
      normName: string | string[],
    ): Promise<
      Pick<
        Selectable<CandidateCardsTable>,
        | "id"
        | "provider"
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
        | "shortCode"
        | "externalId"
        | "extraData"
        | "checkedAt"
      >[]
    > {
      return db
        .selectFrom("candidateCards")
        .select([
          "id",
          "provider",
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
          "shortCode",
          "externalId",
          "extraData",
          "checkedAt",
        ])
        .where("candidateCards.normName", Array.isArray(normName) ? "in" : "=", normName)
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("provider")
        .orderBy("shortCode")
        .execute();
    },

    /**
     * @returns Candidate printings for unmatched detail, excluding ignored.
     * Ordered by collectorNumber, shortCode.
     */
    candidatePrintingsForUnmatched(
      candidateCardIds: string[],
    ): Promise<Selectable<CandidatePrintingsTable>[]> {
      if (candidateCardIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs_parent", "cs_parent.id", "ps.candidateCardId")
        .selectAll("ps")
        .where("ps.candidateCardId", "in", candidateCardIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .orderBy("ps.collectorNumber")
        .orderBy("ps.shortCode")
        .execute();
    },

    // ── GET /export ───────────────────────────────────────────────────────

    /** @returns All cards with all columns, ordered by name. */
    exportCards(): Promise<
      (Selectable<CardsTable> & { domains: string[]; superTypes: string[] })[]
    > {
      return db
        .selectFrom("cards")
        .selectAll()
        .select([
          domainsArray("cards.id").as("domains"),
          superTypesArray("cards.id").as("superTypes"),
        ])
        .orderBy("name")
        .execute() as any;
    },

    /** @returns All card errata keyed by cardId for export. */
    exportCardErrata(): Promise<
      { cardId: string; correctedRulesText: string | null; correctedEffectText: string | null }[]
    > {
      return db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();
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
          "printingImages.id as imageId",
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
