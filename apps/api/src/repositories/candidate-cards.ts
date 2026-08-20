import type { CardFace, MissingImageCard, ProviderStatsResponse } from "@openrift/shared";
import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import type {
  DeleteResult,
  Expression,
  ExpressionBuilder,
  Kysely,
  Selectable,
  SqlBool,
  Updateable,
  UpdateResult,
} from "kysely";
import { expressionBuilder, sql } from "kysely";

import type {
  CardNameAliasesTable,
  CandidateCardsTable,
  CardsTable,
  Database,
  CandidatePrintingsTable,
  PrintingsTable,
} from "../db/index.js";
import type { ProposedCard, ProposedPrinting } from "../lib/card-submission-diff.js";

/**
 * Canonical ORDER BY keys for candidate-printing queries, mirroring the
 * printings_ordered view's canonical_rank (language, set, short code,
 * markerless before markered, marker sort order, finish, size) so candidate
 * printings sort the same everywhere accepted printings do. The query must
 * alias candidate_printings as `ps` and LEFT-join languages as `l`, sets as
 * `s` (on slug — candidate set_id holds the slug directly), finishes as `f`,
 * and card_sizes as `sz`; candidate data is provider-supplied, so unknown
 * reference values sort last (ASC puts NULL sort orders after known ones),
 * the raw column after each joined sort_order tiebreaks them, and the
 * trailing id makes the full order stable. Apply with
 * `CANONICAL_CANDIDATE_PRINTING_ORDER.reduce((q, key) => q.orderBy(key), qb)`.
 */
const CANONICAL_CANDIDATE_PRINTING_ORDER = [
  sql`l.sort_order`,
  sql`ps.language`,
  sql`s.sort_order`,
  sql`ps.set_id`,
  sql`ps.short_code`,
  sql`(array_length(ps.marker_slugs, 1) is not null)`,
  sql`coalesce((select min(m.sort_order) from markers m where m.slug = any(ps.marker_slugs)), 0)`,
  sql`f.sort_order`,
  sql`ps.finish`,
  sql`sz.sort_order`,
  sql`ps.is_signed`,
  sql`ps.id`,
];

/**
 * The three filters below correlate to the outer query only through `sql.ref`
 * on a caller-supplied alias, so they need nothing from the calling query's
 * table scope. Building them on a standalone expression builder rather than the
 * one Kysely hands a `.where()` callback keeps the subqueries fully checked
 * against `Database`, where the old `ExpressionBuilder<Database, any>` parameter
 * silently disabled checking for the whole body. Call sites are unchanged:
 * `.where()` takes a boolean expression as readily as a callback.
 * @returns An expression builder rooted at `Database` with no tables in scope.
 */
function candidateFilterEb() {
  return expressionBuilder<Database, never>();
}

/**
 * Reusable WHERE filter: exclude candidate_cards that appear in ignored_candidate_cards.
 * @param alias — the candidate_cards table alias used in the query (e.g. "cs", "candidateCards")
 * @returns A NOT EXISTS boolean expression.
 */
function notIgnoredCard(alias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
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
 * @returns A NOT EXISTS boolean expression.
 */
function notHiddenSource(alias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
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
 * @returns A NOT EXISTS boolean expression.
 */
function notIgnoredPrinting(alias: string, csAlias: string): Expression<SqlBool> {
  const eb = candidateFilterEb();
  return eb.not(
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
 * Queries and mutations over the candidate tables (`candidate_cards`,
 * `candidate_printings`, `printing_link_overrides`) that back the
 * candidate-cards admin UI: the read side feeding the list and detail views,
 * and the write side that checks, patches, and links candidates against
 * accepted printings. Writes to the accepted catalog itself live in
 * `catalogMutationsRepo`.
 *
 * Each method performs a single database query (or returns early for empty
 * inputs). Response shaping and multi-query orchestration live in the
 * service layer (`services/card-source-queries.ts`).
 *
 * @returns An object with candidate-card methods bound to the given `db`.
 */
export function candidateCardsRepo(db: Kysely<Database>) {
  return {
    // ── Simple list endpoints ─────────────────────────────────────────────

    /**
     * @returns Lightweight card list ordered by slug, with distinct `setSlugs`
     *   across the card's accepted printings (empty array if the card has no
     *   printings yet). Admins use `setSlugs` to scope list and detail views
     *   to a single set.
     */
    listAllCards(): Promise<
      (Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "type"> & {
        types: string[];
        setSlugs: string[];
      })[]
    > {
      return db
        .selectFrom("cards as c")
        .leftJoin("printings as p", "p.cardId", "c.id")
        .leftJoin("sets as s", "s.id", "p.setId")
        .select((eb) => [
          "c.id",
          "c.slug",
          "c.name",
          "c.type",
          // Full ordered type set (ADR-037) via a correlated subquery so it
          // isn't multiplied by the printings/sets join above.
          sql<string[]>`(
            select array_agg(cct.type_slug order by cct.position)
            from card_card_types cct
            where cct.card_id = c.id
          )`.as("types"),
          eb.fn
            .coalesce(
              sql<string[]>`array_agg(distinct s.slug) filter (where s.slug is not null)`,
              sql<string[]>`'{}'::text[]`,
            )
            .as("setSlugs"),
        ])
        .groupBy(["c.id", "c.slug", "c.name", "c.type"])
        .orderBy("c.slug")
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

    /** @returns All printings with fields needed for the card source list, sorted deterministically. */
    listPrintingsForSourceList(): Promise<
      (Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "language"> & {
        setSlug: string | null;
      })[]
    > {
      return db
        .selectFrom("printingsOrdered as p")
        .leftJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "p.shortCode", "p.language", "s.slug as setSlug"])
        .orderBy("p.canonicalRank")
        .execute();
    },

    /**
     * Cards where at least one printing has no active front-face image, with the
     * number of such printings broken down per language.
     * @returns One entry per card, each carrying its per-language missing counts.
     */
    async listCardsWithMissingImages(): Promise<MissingImageCard[]> {
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select((eb) => [
          "p.cardId",
          "c.slug",
          "c.name",
          "p.language",
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
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
        .groupBy(["p.cardId", "c.slug", "c.name", "p.language"])
        .orderBy("c.name")
        .orderBy("p.language")
        .execute();

      const cards = new Map<string, MissingImageCard>();
      for (const row of rows) {
        const card = cards.get(row.cardId) ?? {
          cardId: row.cardId,
          slug: row.slug,
          name: row.name,
          byLanguage: [],
        };
        card.byLanguage.push({ language: row.language, count: Number(row.count) });
        cards.set(row.cardId, card);
      }
      return [...cards.values()];
    },

    /** @returns All candidate printings with fields needed for the card source list, sorted deterministically. */
    listCandidatePrintingsForSourceList(): Promise<
      Pick<
        Selectable<CandidatePrintingsTable>,
        "candidateCardId" | "shortCode" | "checkedAt" | "printingId" | "language" | "setId"
      >[]
    > {
      const query = db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs", "cs.id", "ps.candidateCardId")
        .leftJoin("languages as l", "l.code", "ps.language")
        .leftJoin("sets as s", "s.slug", "ps.setId")
        .leftJoin("finishes as f", "f.slug", "ps.finish")
        .leftJoin("cardSizes as sz", "sz.slug", "ps.size")
        .select([
          "ps.candidateCardId",
          "ps.shortCode",
          "ps.checkedAt",
          "ps.printingId",
          "ps.language",
          // For candidate printings this column stores the set *slug* directly
          // (not a UUID like accepted printings) — see setPrintedTotalBySlugs.
          "ps.setId",
        ])
        .where(notIgnoredPrinting("ps", "cs"))
        .where(notHiddenSource("cs"));
      return CANONICAL_CANDIDATE_PRINTING_ORDER.reduce((q, key) => q.orderBy(key), query).execute();
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

    /**
     * @returns Per-provider card count, printing count, and last-updated
     *   timestamp as an ISO string. The aggregate is a `timestamptz`, which the
     *   driver hands back as a native `Date`, so the conversion happens here
     *   rather than leaving every caller to do it.
     */
    async providerStats(): Promise<ProviderStatsResponse[]> {
      const rows = await db
        .selectFrom("candidateCards as cs")
        .leftJoin("candidatePrintings as ps", "ps.candidateCardId", "cs.id")
        .select((eb) => [
          "cs.provider" as const,
          eb.cast<number>(eb.fn.count("cs.name").distinct(), "integer").as("cardCount"),
          eb.cast<number>(eb.fn.count("ps.id").distinct(), "integer").as("printingCount"),
          // Never null: the group has at least one candidate card, and
          // `candidate_cards.updated_at` is NOT NULL.
          sql<Date>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
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
        lastUpdated: r.lastUpdated.toISOString(),
      }));
    },

    // ── GET /:cardId — detail sub-queries ─────────────────────────────────

    /** @returns A single card by slug, or `undefined`. */
    cardBySlug(slug: string): Promise<Selectable<CardsTable> | undefined> {
      return db.selectFrom("cards").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns Card detail fields for the card source detail page, looked up by slug. */
    cardForDetailBySlug(
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
          | "maxCopiesOverride"
          | "comment"
        > & { domains: string[]; superTypes: string[]; types: string[] })
      | undefined
    > {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .select([
          "cards.id",
          "cards.slug",
          "cards.name",
          "cards.normName",
          "cards.type",
          "cards.might",
          "cards.energy",
          "cards.power",
          "cards.mightBonus",
          "cards.keywords",
          "cards.tags",
          "cards.maxCopiesOverride",
          "cards.comment",
          "mca.domains",
          "mca.superTypes",
          "mca.types",
        ])
        .where("cards.slug", "=", slug)
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

    /**
     * @returns Printings for detail page (no timestamps), in canonical order
     * via the `printings_ordered` view.
     */
    printingsForDetail(cardId: string) {
      return db
        .selectFrom("printingsOrdered")
        .select([
          "id",
          "cardId",
          "setId",
          "shortCode",
          "rarity",
          "artVariant",
          "isSigned",
          "markerSlugs",
          "finish",
          "size",
          "artist",
          "publicCode",
          "printedRulesText",
          "printedEffectText",
          "flavorText",
          "printedName",
          "printedYear",
          "language",
          "comment",
          "canonicalRank",
          "fallbackArtMode",
          "fallbackImageFileId",
        ])
        .where("cardId", "=", cardId)
        .orderBy("canonicalRank")
        .execute();
    },

    /** @returns Candidate printings for detail page, without timestamps. */
    async candidatePrintingsForDetail(
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
        | "rarity"
        | "artVariant"
        | "isSigned"
        | "markerSlugs"
        | "distributionChannelSlugs"
        | "finish"
        | "size"
        | "artist"
        | "publicCode"
        | "printedRulesText"
        | "printedEffectText"
        | "imageUrl"
        | "flavorText"
        | "language"
        | "printedName"
        | "printedYear"
        | "externalId"
        | "extraData"
        | "checkedAt"
      >[]
    > {
      if (candidateCardIds.length === 0) {
        return [];
      }
      const query = db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs_parent", "cs_parent.id", "ps.candidateCardId")
        .leftJoin("languages as l", "l.code", "ps.language")
        .leftJoin("sets as s", "s.slug", "ps.setId")
        .leftJoin("finishes as f", "f.slug", "ps.finish")
        .leftJoin("cardSizes as sz", "sz.slug", "ps.size")
        .select([
          "ps.id",
          "ps.candidateCardId",
          "ps.printingId",
          "ps.shortCode",
          "ps.setId",
          "ps.setName",
          "ps.rarity",
          "ps.artVariant",
          "ps.isSigned",
          "ps.markerSlugs",
          "ps.distributionChannelSlugs",
          "ps.finish",
          "ps.size",
          "ps.artist",
          "ps.publicCode",
          "ps.printedRulesText",
          "ps.printedEffectText",
          "ps.imageUrl",
          "ps.flavorText",
          "ps.language",
          "ps.printedName",
          "ps.printedYear",
          "ps.externalId",
          "ps.extraData",
          "ps.checkedAt",
        ])
        .where("ps.candidateCardId", "in", candidateCardIds)
        .where(notIgnoredPrinting("ps", "cs_parent"))
        .where(notHiddenSource("cs_parent"));
      const rows = await CANONICAL_CANDIDATE_PRINTING_ORDER.reduce(
        (q, key) => q.orderBy(key),
        query,
      ).execute();
      return rows;
    },

    /** @returns Marker ID → slug mapping for given IDs. */
    markerSlugsByIds(ids: string[]): Promise<{ id: string; slug: string }[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("markers").select(["id", "slug"]).where("id", "in", ids).execute();
    },

    /**
     * @returns One row per (printing, channel) link with the channel slug,
     *          for the given printing IDs.
     */
    distributionChannelSlugsForPrintings(
      printingIds: string[],
    ): Promise<{ printingId: string; channelSlug: string }[]> {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingDistributionChannels as pdc")
        .innerJoin("distributionChannels as dc", "dc.id", "pdc.channelId")
        .select(["pdc.printingId", "dc.slug as channelSlug"])
        .where("pdc.printingId", "in", printingIds)
        .execute();
    },

    /** @returns Printing images for detail page, only fields the frontend needs. */
    printingImagesForDetail(printingIds: string[]): Promise<
      {
        id: string;
        printingId: string;
        imageFileId: string;
        face: CardFace;
        originalUrl: string | null;
        rehostedUrl: string | null;
        rotation: number;
        needsTrim: boolean;
        isActive: boolean;
      }[]
    > {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .select([
          "printingImages.id",
          "printingImages.printingId",
          "printingImages.imageFileId",
          "printingImages.face",
          "ci.originalUrl",
          "ci.rehostedUrl",
          "ci.rotation",
          "ci.needsTrim",
          "printingImages.isActive",
        ])
        .where("printingImages.printingId", "in", printingIds)
        .orderBy("printingImages.createdAt", "asc")
        .execute();
    },

    /** @returns Set slug, name and printed total for given IDs. */
    setInfoByIds(setIds: string[]): Promise<
      {
        id: string;
        slug: string;
        name: string;
        printedTotal: number | null;
      }[]
    > {
      if (setIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("sets")
        .select(["id", "slug", "name", "printedTotal"])
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

    /**
     * @returns Candidate cards for detail page, explicit columns. Columns are
     * table-qualified because of the `users` join (`name` exists on both).
     * `submittedByName` is only ever set for user submissions; the join
     * resolves the stored id to something an admin can read. The submitter's
     * email is deliberately not selected — this endpoint is also reachable by
     * card-review grant holders, who have no business seeing contributor
     * contact details.
     */
    async candidateCardsForDetail(
      normName: string | string[],
    ): Promise<
      (Pick<
        Selectable<CandidateCardsTable>,
        | "id"
        | "provider"
        | "name"
        | "types"
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
        | "submittedByUserId"
        | "submissionNote"
      > & { submittedByName: string | null })[]
    > {
      const rows = await db
        .selectFrom("candidateCards")
        .leftJoin("users", "users.id", "candidateCards.submittedByUserId")
        .select([
          "candidateCards.id",
          "candidateCards.provider",
          "candidateCards.name",
          "candidateCards.types",
          "candidateCards.superTypes",
          "candidateCards.domains",
          "candidateCards.might",
          "candidateCards.energy",
          "candidateCards.power",
          "candidateCards.mightBonus",
          "candidateCards.rulesText",
          "candidateCards.effectText",
          "candidateCards.tags",
          "candidateCards.shortCode",
          "candidateCards.externalId",
          "candidateCards.extraData",
          "candidateCards.checkedAt",
          "candidateCards.submittedByUserId",
          "candidateCards.submissionNote",
          "users.name as submittedByName",
        ])
        .where("candidateCards.normName", Array.isArray(normName) ? "in" : "=", normName)
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("candidateCards.provider")
        .orderBy("candidateCards.shortCode")
        .execute();
      return rows;
    },

    // ── card-review provider scoping lookups ─────────────────────────────────

    /** @returns Provider of each given candidate printing (via its candidate card). */
    providersForCandidatePrintings(ids: string[]): Promise<{ id: string; provider: string }[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("candidatePrintings")
        .innerJoin("candidateCards", "candidateCards.id", "candidatePrintings.candidateCardId")
        .select(["candidatePrintings.id", "candidateCards.provider"])
        .where("candidatePrintings.id", "in", ids)
        .execute();
    },

    /**
     * @returns Distinct providers of visible (non-ignored, non-hidden)
     * candidate cards with the given normalized name.
     */
    async candidateProvidersForNormName(normName: string): Promise<string[]> {
      const rows = await db
        .selectFrom("candidateCards")
        .select("provider")
        .distinct()
        .where("candidateCards.normName", "=", normName)
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .execute();
      return rows.map((r) => r.provider);
    },

    /**
     * @returns Distinct providers of candidate data attached to a card:
     * visible candidate cards matched via the card's name aliases, plus
     * candidate printings linked to the card's accepted printings.
     */
    async candidateProvidersForCard(cardId: string): Promise<string[]> {
      const [byAlias, byPrinting] = await Promise.all([
        db
          .selectFrom("candidateCards")
          .innerJoin("cardNameAliases", "cardNameAliases.normName", "candidateCards.normName")
          .select("candidateCards.provider")
          .distinct()
          .where("cardNameAliases.cardId", "=", cardId)
          .where(notIgnoredCard("candidateCards"))
          .where(notHiddenSource("candidateCards"))
          .execute(),
        db
          .selectFrom("candidatePrintings")
          .innerJoin("candidateCards", "candidateCards.id", "candidatePrintings.candidateCardId")
          .innerJoin("printings", "printings.id", "candidatePrintings.printingId")
          .select("candidateCards.provider")
          .distinct()
          .where("printings.cardId", "=", cardId)
          .execute(),
      ]);
      return [...new Set([...byAlias, ...byPrinting].map((r) => r.provider))];
    },

    // ── GET /export ───────────────────────────────────────────────────────

    /** @returns All cards with all columns, ordered by name. */
    exportCards(): Promise<
      (Selectable<CardsTable> & { domains: string[]; superTypes: string[]; types: string[] })[]
    > {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .selectAll("cards")
        .select(["mca.domains", "mca.superTypes", "mca.types"])
        .orderBy("cards.name")
        .execute();
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
      return (
        db
          .selectFrom("printings")
          .innerJoin("sets", "sets.id", "printings.setId")
          .leftJoin("printingImages", (jb) =>
            jb
              .onRef("printingImages.printingId", "=", "printings.id")
              .on("printingImages.face", "=", "front")
              .on("printingImages.isActive", "=", true),
          )
          .leftJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
          .selectAll("printings")
          .select([
            "sets.slug as setSlug",
            "sets.name as setName",
            "printingImages.id as imageId",
            "ci.rehostedUrl",
            "ci.originalUrl",
          ])
          // Same canonical order as every other printing list (the old keys
          // led with the set UUID, which is an arbitrary order).
          .innerJoin("printingsOrdered as po", "po.id", "printings.id")
          .orderBy("po.canonicalRank")
          .execute()
      );
    },

    // ── Submission review state (ADR-036) ─────────────────────────────────

    /**
     * How far review has got on each candidate: whether the card itself is
     * checked, and how many of its printings are not. A user submission is only
     * settled once both are done, so checking one printing of a multi-printing
     * submission doesn't resolve it early.
     * @param candidateCardIds The candidates to report on.
     * @returns A map from candidate id to its review state.
     */
    async reviewStateForCandidates(
      candidateCardIds: string[],
    ): Promise<Map<string, { checked: boolean; uncheckedPrintings: number }>> {
      const states = new Map<string, { checked: boolean; uncheckedPrintings: number }>();
      if (candidateCardIds.length === 0) {
        return states;
      }
      const rows = await db
        .selectFrom("candidateCards as cc")
        .leftJoin("candidatePrintings as cp", (join) =>
          join.onRef("cp.candidateCardId", "=", "cc.id").on("cp.checkedAt", "is", null),
        )
        .select(({ fn }) => [
          "cc.id",
          "cc.checkedAt",
          fn.count<string>("cp.id").as("uncheckedPrintings"),
        ])
        .where("cc.id", "in", candidateCardIds)
        .groupBy(["cc.id", "cc.checkedAt"])
        .execute();
      for (const row of rows) {
        states.set(row.id, {
          checked: row.checkedAt !== null,
          uncheckedPrintings: Number(row.uncheckedPrintings),
        });
      }
      return states;
    },

    /**
     * The values a candidate proposed, in the shape the submission diff
     * compares. Read back from staging rather than kept on the ledger so the
     * review-time comparison uses exactly what the admin is looking at.
     * @param candidateCardId The candidate to read.
     * @returns The proposed card and printings, or null when the candidate is gone.
     */
    async proposalForCandidate(
      candidateCardId: string,
    ): Promise<{ card: ProposedCard; printings: ProposedPrinting[] } | null> {
      const card = await db
        .selectFrom("candidateCards")
        .select(["name", "types", "might", "energy", "power", "mightBonus", "tags"])
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
      if (!card) {
        return null;
      }
      const printings = await db
        .selectFrom("candidatePrintings")
        .select([
          "shortCode",
          // Identity, not compared: a short code alone does not distinguish a
          // card's finishes and languages from one another.
          "finish",
          "markerSlugs",
          "language",
          "rarity",
          "artist",
          "artVariant",
          "size",
          "isSigned",
          "flavorText",
          "printedRulesText",
          "printedEffectText",
          "printedName",
          "imageUrl",
        ])
        .where("candidateCardId", "=", candidateCardId)
        .execute();
      return { card, printings };
    },

    // ── Candidate card checks ─────────────────────────────────────────────

    /**
     * Mark a single candidate card as checked.
     * @returns Update result.
     */
    checkCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: new Date() })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    /**
     * Clear checked_at on a single candidate card.
     * @returns Update result.
     */
    uncheckCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    /**
     * Mark all candidate cards with matching normalized names OR linked to the
     * given card via candidate_printings → printings as checked.
     *
     * Returns the ids as well as the count so submission resolution knows which
     * candidates this covers, rather than restating the match predicate in a
     * second query where the two could drift.
     *
     * The ids are **every** matching candidate, not only the rows this call
     * flipped. A candidate checked one entry at a time before its printings
     * were done stays pending, and a later "check all" would otherwise update
     * nothing and so resolve nothing, leaving the submission stuck. Resolution
     * gates on the candidate being fully checked anyway, so a wider set is safe.
     *
     * @returns The rows updated and the matching candidate card ids.
     */
    async checkAllCandidateCards(
      normNames: string[],
      cardId: string,
    ): Promise<{ updated: number; candidateCardIds: string[] }> {
      const now = new Date();
      // Candidate cards linked because their candidate_printings already have a printingId
      const linkedByPrintingId = db
        .selectFrom("candidatePrintings")
        .innerJoin("printings", "printings.id", "candidatePrintings.printingId")
        .select("candidatePrintings.candidateCardId")
        .where("printings.cardId", "=", cardId);

      // Candidate cards linked because their candidate_printings have a shortCode matching
      // a printing's shortCode (same logic as the display query)
      const printingShortCodes = db
        .selectFrom("printings")
        .select("shortCode")
        .where("cardId", "=", cardId);
      const linkedByShortCode = db
        .selectFrom("candidatePrintings as ps_match")
        .select("ps_match.candidateCardId")
        .where("ps_match.shortCode", "in", printingShortCodes);

      const matches = (eb: ExpressionBuilder<Database, "candidateCards">) =>
        eb.or([
          eb("candidateCards.normName", "in", normNames),
          eb("candidateCards.id", "in", linkedByPrintingId),
          eb("candidateCards.id", "in", linkedByShortCode),
        ]);

      const rows = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where(matches)
        .where("checkedAt", "is", null)
        .returning("id")
        .execute();

      const allMatching = await db
        .selectFrom("candidateCards")
        .select("id")
        .where(matches)
        .execute();

      return { updated: rows.length, candidateCardIds: allMatching.map((row) => row.id) };
    },

    // ── Candidate printing checks ─────────────────────────────────────────

    /**
     * Mark a single candidate printing as checked.
     * @returns The parent candidate card id, or undefined when no row matched.
     */
    checkCandidatePrinting(id: string): Promise<{ candidateCardId: string } | undefined> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where("id", "=", id)
        .returning("candidateCardId")
        .executeTakeFirst();
    },

    /**
     * Clear checked_at on a single candidate printing.
     * @returns Update result.
     */
    uncheckCandidatePrinting(id: string): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Mark all candidate printings for a given printing (and optional extra IDs) as checked.
     * @returns The rows updated and the distinct parent candidate card ids.
     */
    async checkAllCandidatePrintings(
      printingId?: string,
      extraIds?: string[],
    ): Promise<{ updated: number; candidateCardIds: string[] }> {
      if (!printingId && !extraIds?.length) {
        return { updated: 0, candidateCardIds: [] };
      }
      const rows = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where((eb) =>
          eb.or([
            ...(printingId ? [eb("printingId", "=", printingId)] : []),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checkedAt", "is", null)
        .returning("candidateCardId")
        .execute();
      return {
        updated: rows.length,
        candidateCardIds: [...new Set(rows.map((row) => row.candidateCardId))],
      };
    },

    /**
     * Mark all candidate cards and printings for a given provider as checked.
     * @returns Number of cards and printings checked.
     */
    async checkByProvider(
      provider: string,
      now: Date,
    ): Promise<{ cardsChecked: number; printingsChecked: number }> {
      const cardResult = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where("provider", "=", provider)
        .where("checkedAt", "is", null)
        .execute();

      const printingResult = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: now })
        .where("checkedAt", "is", null)
        .where(
          "candidateCardId",
          "in",
          db.selectFrom("candidateCards").select("id").where("provider", "=", provider),
        )
        .execute();

      return {
        cardsChecked: Number(cardResult[0].numUpdatedRows),
        printingsChecked: Number(printingResult[0].numUpdatedRows),
      };
    },

    // ── Candidate printing mutations ──────────────────────────────────────

    /**
     * Patch allowed fields on a candidate printing.
     * @returns Update result.
     */
    patchCandidatePrinting(
      id: string,
      updates: Updateable<CandidatePrintingsTable>,
    ): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Delete a candidate printing by ID.
     * @returns Delete result.
     */
    deleteCandidatePrinting(id: string): Promise<DeleteResult> {
      return db.deleteFrom("candidatePrintings").where("id", "=", id).executeTakeFirst();
    },

    /** @returns A candidate printing by ID (all columns). */
    getCandidatePrintingById(id: string): Promise<Selectable<CandidatePrintingsTable> | undefined> {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** Copy a candidate printing and link it to a different printing. */
    async copyCandidatePrinting(
      ps: Selectable<CandidatePrintingsTable>,
      target: {
        id: string;
        rarity: string | null;
        artVariant: string | null;
        isSigned: boolean;
        markerSlugs: string[];
        finish: string;
      },
    ): Promise<void> {
      await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: ps.candidateCardId,
          printingId: target.id,
          shortCode: ps.shortCode,
          setId: ps.setId,
          setName: ps.setName,
          rarity: target.rarity as Rarity | null,
          artVariant: target.artVariant as ArtVariant | null,
          isSigned: target.isSigned,
          markerSlugs: target.markerSlugs,
          finish: target.finish as Finish,
          artist: ps.artist,
          publicCode: ps.publicCode,
          printedRulesText: ps.printedRulesText,
          printedEffectText: ps.printedEffectText,
          imageUrl: ps.imageUrl,
          flavorText: ps.flavorText,
          externalId: `${ps.externalId ?? ps.shortCode}-copy-${Date.now()}`,
          extraData: ps.extraData,
        })
        .execute();
    },

    /**
     * Delete all candidate cards for a given provider name.
     * @returns Number of deleted rows.
     */
    async deleteByProvider(provider: string): Promise<number> {
      const result = await db
        .deleteFrom("candidateCards")
        .where("provider", "=", provider)
        .execute();
      return Number(result[0].numDeletedRows);
    },

    // ── Candidate printing linking ────────────────────────────────────────

    /** Bulk-link (or unlink) candidate printings to a printing UUID. */
    async linkCandidatePrintings(
      candidatePrintingIds: string[],
      printingUuid: string | null,
    ): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: printingUuid })
        .where("id", "in", candidatePrintingIds)
        .execute();
    },

    /** Link candidate printings to a printing UUID and mark as checked. */
    async linkAndCheckCandidatePrintings(
      candidatePrintingIds: string[],
      printingUuid: string,
    ): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: printingUuid, checkedAt: new Date() })
        .where("id", "in", candidatePrintingIds)
        .execute();
    },

    /** Unlink all candidate_printings referencing a printing UUID (set printing_id to null). */
    async unlinkCandidatePrintingsByPrintingId(printingId: string): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: null })
        .where("printingId", "=", printingId)
        .execute();
    },

    /** Upsert printing link overrides for the given candidate printing IDs. */
    async upsertPrintingLinkOverrides(
      candidatePrintingIds: string[],
      printingId: string,
    ): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings as cp")
        .innerJoin("candidateCards as cc", "cc.id", "cp.candidateCardId")
        .select(["cp.externalId", "cp.finish", "cc.provider"])
        .where("cp.id", "in", candidatePrintingIds)
        .execute();
      // Dedupe on the conflict key: two candidate printings sharing one
      // (external id, finish, provider) would make the single INSERT hit the
      // same row twice, which ON CONFLICT DO UPDATE refuses.
      const byKey = new Map(
        rows.map((row) => [
          `${row.provider}:${row.externalId}:${row.finish ?? ""}`,
          {
            externalId: row.externalId,
            finish: row.finish ?? "",
            provider: row.provider,
            printingId,
          },
        ]),
      );
      if (byKey.size === 0) {
        return;
      }
      await db
        .insertInto("printingLinkOverrides")
        .values([...byKey.values()])
        .onConflict((oc) =>
          oc.columns(["externalId", "finish", "provider"]).doUpdateSet({ printingId }),
        )
        .execute();
    },

    /** Remove printing link overrides for the given candidate printing IDs (unlink). */
    async removePrintingLinkOverrides(candidatePrintingIds: string[]): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings as cp")
        .innerJoin("candidateCards as cc", "cc.id", "cp.candidateCardId")
        .select(["cp.externalId", "cp.finish", "cc.provider"])
        .where("cp.id", "in", candidatePrintingIds)
        .execute();
      if (rows.length === 0) {
        return;
      }
      await db
        .deleteFrom("printingLinkOverrides")
        .where((eb) =>
          eb.or(
            rows.map((row) =>
              eb.and([
                eb("externalId", "=", row.externalId),
                eb("finish", "=", row.finish ?? ""),
                // The '' wildcard row would keep re-pinning this candidate on
                // the next ingest, so an unlink removes it too.
                eb("provider", "in", [row.provider, ""]),
              ]),
            ),
          ),
        )
        .execute();
    },

    /** Delete printing_link_overrides that reference a printing ID. */
    async deletePrintingLinkOverridesById(printingId: string): Promise<void> {
      await db.deleteFrom("printingLinkOverrides").where("printingId", "=", printingId).execute();
    },
  };
}
