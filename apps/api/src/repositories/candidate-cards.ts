import type { MissingImageCard, ProviderStatsResponse } from "@openrift/shared/types/api/admin";
import type { CardFace, ArtVariant, Finish, Rarity } from "@openrift/shared/types/enums";
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
 * trailing id makes the full order stable.
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
 * The filters below correlate to the outer query only through `sql.ref` on a
 * caller-supplied alias, so they need nothing from the calling query's table
 * scope. A standalone expression builder keeps the subqueries fully checked
 * against `Database`; an `ExpressionBuilder<Database, any>` parameter would
 * silently disable checking for the whole body.
 */
function candidateFilterEb() {
  return expressionBuilder<Database, never>();
}

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

interface ExportPrintingRow extends Selectable<PrintingsTable> {
  setSlug: string;
  setName: string;
  imageId: string | null;
  rehostedUrl: string | null;
  originalUrl: string | null;
}

/**
 * Writes to the accepted catalog itself live in `catalogMutationsRepo`. Each
 * method performs a single database query (or returns early for empty inputs);
 * response shaping and multi-query orchestration live in the service layer.
 */
export function candidateCardsRepo(db: Kysely<Database>) {
  return {
    listAllCards(): Promise<
      (Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "type"> & {
        types: string[];
        setSlugs: string[];
        shortCodes: string[];
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
          // Correlated subquery so the printings/sets join above doesn't
          // multiply the type rows.
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
          eb.fn
            .coalesce(
              sql<
                string[]
              >`array_agg(distinct p.short_code) filter (where p.short_code is not null)`,
              sql<string[]>`'{}'::text[]`,
            )
            .as("shortCodes"),
        ])
        .groupBy(["c.id", "c.slug", "c.name", "c.type"])
        .orderBy("c.slug")
        .execute();
    },

    listCardsForSourceList(): Promise<
      Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "normName">[]
    > {
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name", "normName"])
        .orderBy("slug")
        .execute();
    },

    listAliasesForSourceList(): Promise<
      Pick<Selectable<CardNameAliasesTable>, "normName" | "cardId">[]
    > {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

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
          // For candidate printings this column stores the set *slug* directly,
          // not a UUID like accepted printings.
          "ps.setId",
        ])
        .where(notIgnoredPrinting("ps", "cs"))
        .where(notHiddenSource("cs"));
      return CANONICAL_CANDIDATE_PRINTING_ORDER.reduce((q, key) => q.orderBy(key), query).execute();
    },

    async distinctArtists(): Promise<string[]> {
      const rows = await db
        .selectFrom("printings")
        .select("artist")
        .distinct()
        .orderBy("artist")
        .execute();
      return rows.map((r) => r.artist);
    },

    async distinctProviderNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("candidateCards")
        .select("provider")
        .distinct()
        .orderBy("provider")
        .execute();
      return rows.map((r) => r.provider);
    },

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

    cardBySlug(slug: string): Promise<Selectable<CardsTable> | undefined> {
      return db.selectFrom("cards").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

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

    cardNameAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

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
          "isOvernumbered",
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
        | "isOvernumbered"
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
          "ps.isOvernumbered",
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

    markerSlugsByIds(ids: string[]): Promise<{ id: string; slug: string }[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("markers").select(["id", "slug"]).where("id", "in", ids).execute();
    },

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

    /** Unfiltered: no ignore/hidden exclusions. */
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
     * The submitter's email is deliberately not selected: this endpoint is
     * also reachable by card-review grant holders, who have no business
     * seeing contributor contact details.
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

    exportCardErrata(): Promise<
      { cardId: string; correctedRulesText: string | null; correctedEffectText: string | null }[]
    > {
      return db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();
    },

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
        .leftJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .selectAll("printings")
        .select([
          "sets.slug as setSlug",
          "sets.name as setName",
          "printingImages.id as imageId",
          "ci.rehostedUrl",
          "ci.originalUrl",
        ])
        .innerJoin("printingsOrdered as po", "po.id", "printings.id")
        .orderBy("po.canonicalRank")
        .execute();
    },

    /**
     * How far review has got on each candidate: whether the card itself is
     * checked, and how many of its printings are not. A user submission is only
     * settled once both are done, so checking one printing of a multi-printing
     * submission doesn't resolve it early.
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

    // Reads current values from candidate staging, not the ledger, so the review-time comparison stays live.
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
          "isOvernumbered",
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

    checkCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: new Date() })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    uncheckCandidateCard(candidateCardId: string): Promise<UpdateResult> {
      return db
        .updateTable("candidateCards")
        .set({ checkedAt: null })
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    /**
     * Marks all candidate cards with matching normalized names OR linked to the given card as checked.
     * The returned ids are every matching candidate, not only the rows this call flipped.
     */
    async checkAllCandidateCards(
      normNames: string[],
      cardId: string,
    ): Promise<{ updated: number; candidateCardIds: string[] }> {
      const now = new Date();
      const linkedByPrintingId = db
        .selectFrom("candidatePrintings")
        .innerJoin("printings", "printings.id", "candidatePrintings.printingId")
        .select("candidatePrintings.candidateCardId")
        .where("printings.cardId", "=", cardId);

      // Short-code linking matches the display query's logic.
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

    checkCandidatePrinting(id: string): Promise<{ candidateCardId: string } | undefined> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where("id", "=", id)
        .returning("candidateCardId")
        .executeTakeFirst();
    },

    uncheckCandidatePrinting(id: string): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: null })
        .where("id", "=", id)
        .executeTakeFirst();
    },

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

    async checkByProvider(
      provider: string,
      now: Date,
    ): Promise<{ cardsChecked: number; printingsChecked: number }> {
      const cardResult = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where("provider", "=", provider)
        .where("checkedAt", "is", null)
        .executeTakeFirstOrThrow();

      const printingResult = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: now })
        .where("checkedAt", "is", null)
        .where(
          "candidateCardId",
          "in",
          db.selectFrom("candidateCards").select("id").where("provider", "=", provider),
        )
        .executeTakeFirstOrThrow();

      return {
        cardsChecked: Number(cardResult.numUpdatedRows),
        printingsChecked: Number(printingResult.numUpdatedRows),
      };
    },

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

    deleteCandidatePrinting(id: string): Promise<DeleteResult> {
      return db.deleteFrom("candidatePrintings").where("id", "=", id).executeTakeFirst();
    },

    getCandidatePrintingById(id: string): Promise<Selectable<CandidatePrintingsTable> | undefined> {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async copyCandidatePrinting(
      ps: Selectable<CandidatePrintingsTable>,
      target: {
        id: string;
        rarity: string | null;
        artVariant: string | null;
        isSigned: boolean;
        isOvernumbered: boolean;
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
          isOvernumbered: target.isOvernumbered,
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

    async deleteByProvider(provider: string): Promise<number> {
      const result = await db
        .deleteFrom("candidateCards")
        .where("provider", "=", provider)
        .executeTakeFirstOrThrow();
      return Number(result.numDeletedRows);
    },

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

    async unlinkCandidatePrintingsByPrintingId(printingId: string): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: null })
        .where("printingId", "=", printingId)
        .execute();
    },

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

    async deletePrintingLinkOverridesById(printingId: string): Promise<void> {
      await db.deleteFrom("printingLinkOverrides").where("printingId", "=", printingId).execute();
    },
  };
}
