import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import type { CardFace } from "@openrift/shared/types/enums";
import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
} from "../../../db/tables/candidates.js";
import type { CardsTable } from "../../../db/tables/catalog.js";
import {
  CANONICAL_CANDIDATE_PRINTING_ORDER,
  notHiddenSource,
  notIgnoredCard,
  notIgnoredPrinting,
} from "./candidate-cards-shared.js";

export function candidateCardDetailRepo(db: Kysely<Database>) {
  return {
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
        quad: ImageQuad | null;
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
          "ci.quad",
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
  };
}
