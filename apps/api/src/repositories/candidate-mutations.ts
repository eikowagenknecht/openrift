import { extractKeywords } from "@openrift/shared/keywords";
import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable, UpdateResult } from "kysely";

import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
  CardsTable,
  Database,
  PrintingsTable,
} from "../db/index.js";

/**
 * Mutation queries for candidate cards, candidate printings, cards, and printings
 * used by the admin card-source management routes.
 *
 * @returns An object with mutation methods bound to the given `db`.
 */
export function candidateMutationsRepo(db: Kysely<Database>) {
  return {
    // ── Candidate card checks ────────────────────────────────────────────────────

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
     * @returns The total number of rows updated.
     */
    async checkAllCandidateCards(normNames: string[], cardId: string): Promise<number> {
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

      const results = await db
        .updateTable("candidateCards")
        .set({ checkedAt: now })
        .where((eb) =>
          eb.or([
            eb("candidateCards.normName", "in", normNames),
            eb("candidateCards.id", "in", linkedByPrintingId),
            eb("candidateCards.id", "in", linkedByShortCode),
          ]),
        )
        .where("checkedAt", "is", null)
        .execute();
      return results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    },

    // ── Candidate printing checks ────────────────────────────────────────────────

    /**
     * Mark a single candidate printing as checked.
     * @returns Update result.
     */
    checkCandidatePrinting(id: string): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where("id", "=", id)
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
     * @returns The total number of rows updated.
     */
    async checkAllCandidatePrintings(printingId?: string, extraIds?: string[]): Promise<number> {
      if (!printingId && !extraIds?.length) {
        return 0;
      }
      const results = await db
        .updateTable("candidatePrintings")
        .set({ checkedAt: new Date() })
        .where((eb) =>
          eb.or([
            ...(printingId ? [eb("printingId", "=", printingId)] : []),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checkedAt", "is", null)
        .execute();
      return results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    },

    // ── Candidate printing mutations ─────────────────────────────────────────────

    /**
     * Patch allowed fields on a candidate printing.
     * @returns Update result.
     */
    patchCandidatePrinting(id: string, updates: Record<string, unknown>): Promise<UpdateResult> {
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

    /** @returns A printing's differentiator fields by UUID. */
    getPrintingDifferentiatorsById(id: string) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "artVariant", "isSigned", "promoTypeId", "rarity"])
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
        promoTypeId: string | null;
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
          promoTypeId: target.promoTypeId,
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

    // ── Candidate printing linking ───────────────────────────────────────────────

    /** @returns A printing's shortCode, finish, and language by UUID. */
    getPrintingById(
      id: string,
    ): Promise<{ id: string; shortCode: string; finish: string; language: string } | undefined> {
      return db
        .selectFrom("printings")
        .select(["id", "shortCode", "finish", "language"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A full printing row by UUID (for change tracking). */
    getFullPrintingById(id: string): Promise<Selectable<PrintingsTable> | undefined> {
      return db.selectFrom("printings").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing's cardId by UUID. */
    getPrintingCardIdById(id: string): Promise<{ cardId: string } | undefined> {
      return db.selectFrom("printings").select("cardId").where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing's cardId by composite key (shortCode, finish, promoTypeId, language). */
    getPrintingCardIdByComposite(
      shortCode: string,
      finish: Finish,
      promoTypeId: string | null,
      language: string,
    ): Promise<{ cardId: string } | undefined> {
      return db
        .selectFrom("printings")
        .select("cardId")
        .where("shortCode", "=", shortCode)
        .where("finish", "=", finish)
        .where("promoTypeId", promoTypeId ? "=" : "is", promoTypeId)
        .where("language", "=", language)
        .executeTakeFirst();
    },

    /** @returns The printed_total of the set a printing belongs to. */
    getSetPrintedTotalForPrinting(
      printingId: string,
    ): Promise<{ printedTotal: number | null } | undefined> {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select("sets.printedTotal")
        .where("printings.id", "=", printingId)
        .executeTakeFirst();
    },

    /** Update arbitrary fields on a printing by UUID. */
    async updatePrintingById(id: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("printings").set(updates).where("id", "=", id).execute();
    },

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

    /** Upsert printing link overrides for the given candidate printing IDs. */
    async upsertPrintingLinkOverrides(
      candidatePrintingIds: string[],
      printingId: string,
    ): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings")
        .select(["externalId", "finish"])
        .where("id", "in", candidatePrintingIds)
        .execute();
      for (const row of rows) {
        await db
          .insertInto("printingLinkOverrides")
          .values({
            externalId: row.externalId,
            finish: row.finish ?? "",
            printingId,
          })
          .onConflict((oc) => oc.columns(["externalId", "finish"]).doUpdateSet({ printingId }))
          .execute();
      }
    },

    /** Remove printing link overrides for the given candidate printing IDs (unlink). */
    async removePrintingLinkOverrides(candidatePrintingIds: string[]): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings")
        .select(["externalId", "finish"])
        .where("id", "in", candidatePrintingIds)
        .execute();
      if (rows.length === 0) {
        return;
      }
      for (const row of rows) {
        await db
          .deleteFrom("printingLinkOverrides")
          .where("externalId", "=", row.externalId)
          .where("finish", "=", row.finish ?? "")
          .execute();
      }
    },

    // ── Card mutations ────────────────────────────────────────────────────────

    /** @returns A card's ID and name by slug. */
    getCardBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id" | "name"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** @returns A card's ID and name by UUID. */
    getCardById(
      id: string,
    ): Promise<Pick<Selectable<CardsTable>, "id" | "name" | "slug"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["id", "name", "slug"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A card's ID by slug. */
    getCardIdBySlug(slug: string): Promise<Pick<Selectable<CardsTable>, "id"> | undefined> {
      return db.selectFrom("cards").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns Alias normNames for a card. */
    getCardAliases(cardId: string): Promise<{ normName: string }[]> {
      return db
        .selectFrom("cardNameAliases")
        .select("normName")
        .where("cardId", "=", cardId)
        .execute();
    },

    /** Rename a card's slug by card UUID. */
    async renameCardSlugById(cardId: string, newSlug: string): Promise<void> {
      await db.updateTable("cards").set({ slug: newSlug }).where("id", "=", cardId).execute();
    },

    /**
     * Get errata text for a card by slug.
     * @returns Errata correctedRulesText and correctedEffectText, or null if no errata exists.
     */
    async getCardTexts(slug: string) {
      return (
        (await db
          .selectFrom("cardErrata")
          .innerJoin("cards", "cards.id", "cardErrata.cardId")
          .select(["cardErrata.correctedRulesText", "cardErrata.correctedEffectText"])
          .where("cards.slug", "=", slug)
          .executeTakeFirst()) ?? null
      );
    },

    /** @returns EN printing-level rules/effect texts for a card identified by slug. */
    getPrintingTextsForCardSlug(
      slug: string,
    ): Promise<Pick<Selectable<PrintingsTable>, "printedRulesText" | "printedEffectText">[]> {
      return db
        .selectFrom("printings")
        .innerJoin("cards", "cards.id", "printings.cardId")
        .select(["printings.printedRulesText", "printings.printedEffectText"])
        .where("cards.slug", "=", slug)
        .where("printings.language", "=", "EN")
        .execute();
    },

    /** @returns EN printing-level rules/effect texts for a card identified by UUID. */
    getPrintingTextsForCardId(
      cardId: string,
    ): Promise<Pick<Selectable<PrintingsTable>, "printedRulesText" | "printedEffectText">[]> {
      return db
        .selectFrom("printings")
        .select(["printings.printedRulesText", "printings.printedEffectText"])
        .where("printings.cardId", "=", cardId)
        .where("printings.language", "=", "EN")
        .execute();
    },

    /** Update arbitrary fields on a card by slug. */
    async updateCardBySlug(slug: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("cards").set(updates).where("slug", "=", slug).execute();
    },

    /** Update arbitrary fields on a card by UUID. */
    async updateCardById(id: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("cards").set(updates).where("id", "=", id).execute();
    },

    /** Replace all domains for a card by UUID (delete + insert). */
    async replaceCardDomainsById(cardId: string, domains: string[]): Promise<void> {
      await db.deleteFrom("cardDomains").where("cardId", "=", cardId).execute();
      if (domains.length > 0) {
        await db
          .insertInto("cardDomains")
          .values(
            domains.map((domain, index) => ({
              cardId,
              domainSlug: domain,
              ordinal: index,
            })),
          )
          .execute();
      }
    },

    /** Replace all super types for a card by UUID (delete + insert). */
    async replaceCardSuperTypesById(cardId: string, superTypes: string[]): Promise<void> {
      await db.deleteFrom("cardSuperTypes").where("cardId", "=", cardId).execute();
      if (superTypes.length > 0) {
        await db
          .insertInto("cardSuperTypes")
          .values(superTypes.map((superType) => ({ cardId, superTypeSlug: superType })))
          .execute();
      }
    },

    // ── Printing mutations ────────────────────────────────────────────────────

    /**
     * Delete a printing by UUID.
     * @returns The deleted row's ID, or undefined if not found.
     */
    deletePrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.deleteFrom("printings").where("id", "=", id).returning("id").executeTakeFirst();
    },

    /** Unlink all candidate_printings referencing a printing UUID (set printing_id to null). */
    async unlinkCandidatePrintingsByPrintingId(printingId: string): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: null })
        .where("printingId", "=", printingId)
        .execute();
    },

    /**
     * Delete all printing_images for a printing UUID.
     * @returns imageFileIds for cleanup.
     */
    deletePrintingImagesByPrintingId(printingId: string): Promise<{ imageFileId: string }[]> {
      return db
        .deleteFrom("printingImages")
        .where("printingId", "=", printingId)
        .returning("imageFileId")
        .execute();
    },

    /** @returns An image_file row by ID (rehostedUrl for disk cleanup). */
    getImageFileById(
      imageFileId: string,
    ): Promise<{ id: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("imageFiles")
        .select(["id", "rehostedUrl"])
        .where("id", "=", imageFileId)
        .executeTakeFirst();
    },

    /** @returns Whether any printing_images row still references the given image_file. */
    async isImageFileReferenced(imageFileId: string): Promise<boolean> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("imageFileId", "=", imageFileId)
        .executeTakeFirstOrThrow();
      return Number(result.count) > 0;
    },

    /** Delete an image_files row by ID. */
    async deleteImageFileById(imageFileId: string): Promise<void> {
      await db.deleteFrom("imageFiles").where("id", "=", imageFileId).execute();
    },

    /** Delete printing_link_overrides that reference a printing ID. */
    async deletePrintingLinkOverridesById(printingId: string): Promise<void> {
      await db.deleteFrom("printingLinkOverrides").where("printingId", "=", printingId).execute();
    },

    /** Update a single field on a printing by UUID. */
    async updatePrintingFieldById(id: string, field: string, value: unknown): Promise<void> {
      await db
        .updateTable("printings")
        .set({ [field]: value })
        .where("id", "=", id)
        .execute();
    },

    /**
     * Recompute keywords for the card that owns the given printing by scanning
     * all sibling printings' text plus any card-level errata text.
     */
    async recomputeKeywordsForPrintingCard(printingId: string): Promise<void> {
      const row = await db
        .selectFrom("printings")
        .select(["printings.cardId"])
        .where("printings.id", "=", printingId)
        .executeTakeFirst();

      if (!row) {
        return;
      }

      const errata = await db
        .selectFrom("cardErrata")
        .select(["correctedRulesText", "correctedEffectText"])
        .where("cardId", "=", row.cardId)
        .executeTakeFirst();

      const siblings = await db
        .selectFrom("printings")
        .select(["printedRulesText", "printedEffectText"])
        .where("cardId", "=", row.cardId)
        .where("language", "=", "EN")
        .execute();

      const keywords = [
        ...extractKeywords(errata?.correctedRulesText ?? ""),
        ...extractKeywords(errata?.correctedEffectText ?? ""),
        ...siblings.flatMap((s) => [
          ...extractKeywords(s.printedRulesText ?? ""),
          ...extractKeywords(s.printedEffectText ?? ""),
        ]),
      ].filter((v, i, a) => a.indexOf(v) === i);

      await db.updateTable("cards").set({ keywords }).where("id", "=", row.cardId).execute();
    },

    /**
     * Recompute keywords for all cards by scanning card-level and printing-level
     * text fields. Only updates cards whose computed keywords differ.
     * @returns Count of total cards scanned and cards actually updated.
     */
    async recomputeAllKeywords(): Promise<{ totalCards: number; updated: number }> {
      const cards = await db.selectFrom("cards").select(["id", "keywords"]).execute();

      const errata = await db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();

      const errataByCard = new Map(errata.map((e) => [e.cardId, e]));

      const printings = await db
        .selectFrom("printings")
        .select(["cardId", "printedRulesText", "printedEffectText"])
        .where("language", "=", "EN")
        .execute();

      const printingsByCard = Map.groupBy(printings, (row) => row.cardId);

      let updated = 0;

      for (const card of cards) {
        const cardErrata = errataByCard.get(card.id);
        const cardPrintings = printingsByCard.get(card.id) ?? [];

        const keywords = [
          ...extractKeywords(cardErrata?.correctedRulesText ?? ""),
          ...extractKeywords(cardErrata?.correctedEffectText ?? ""),
          ...cardPrintings.flatMap((p) => [
            ...extractKeywords(p.printedRulesText ?? ""),
            ...extractKeywords(p.printedEffectText ?? ""),
          ]),
        ].filter((v, i, a) => a.indexOf(v) === i);

        const existing = card.keywords as string[];
        const changed =
          keywords.length !== existing.length || keywords.some((kw) => !existing.includes(kw));

        if (changed) {
          await db.updateTable("cards").set({ keywords }).where("id", "=", card.id).execute();
          updated++;
        }
      }

      return { totalCards: cards.length, updated };
    },

    // ── Accept printing ───────────────────────────────────────────────────────

    /** @returns The provider name from the candidate_card linked to a candidate_printing. */
    getProviderNameForCandidatePrinting(
      candidatePrintingId: string,
    ): Promise<{ provider: string } | undefined> {
      return db
        .selectFrom("candidatePrintings")
        .innerJoin("candidateCards", "candidateCards.id", "candidatePrintings.candidateCardId")
        .select("candidateCards.provider")
        .where("candidatePrintings.id", "=", candidatePrintingId)
        .executeTakeFirst();
    },

    /** @returns Set UUID by slug. */
    getSetIdBySlug(slug: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /**
     * Insert or update a printing.
     * Uses composite unique constraint on (cardId, shortCode, finish, promoTypeId).
     * @returns The new or existing printing UUID.
     */
    async upsertPrinting(values: {
      cardId: string;
      setId: string;
      shortCode: string;
      rarity: Rarity;
      artVariant: ArtVariant;
      isSigned: boolean;
      promoTypeId: string | null;
      finish: Finish;
      artist: string;
      publicCode: string;
      printedRulesText: string | null;
      printedEffectText: string | null;
      flavorText: string | null;
      language: string;
      printedName: string | null;
    }): Promise<string> {
      const result = await db
        .insertInto("printings")
        .values(values)
        .onConflict((oc) =>
          oc
            .columns(["cardId", "shortCode", "finish", "promoTypeId", "language"])
            .doUpdateSet((eb) => ({
              artist: eb.ref("excluded.artist"),
              publicCode: eb.ref("excluded.publicCode"),
              printedRulesText: eb.ref("excluded.printedRulesText"),
              printedEffectText: eb.ref("excluded.printedEffectText"),
              flavorText: eb.ref("excluded.flavorText"),
              printedName: eb.ref("excluded.printedName"),
            })),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      return result.id;
    },

    // ── Accept new (single source) helpers ────────────────────────────────────

    /** @returns Candidate card name and provider for a candidate card ID. */
    getCandidateCardNameAndProvider(
      id: string,
    ): Promise<Pick<Selectable<CandidateCardsTable>, "name" | "provider"> | undefined> {
      return db
        .selectFrom("candidateCards")
        .select(["name", "provider"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns Card ID resolved by normName (direct match). */
    resolveCardByNormName(normName: string): Promise<{ id: string } | undefined> {
      return db
        .selectFrom("cards")
        .select("id")
        .where("cards.normName", "=", normName)
        .executeTakeFirst();
    },

    /** @returns Card ID resolved by alias normName. */
    resolveCardByAlias(normName: string): Promise<{ cardId: string } | undefined> {
      return db
        .selectFrom("cardNameAliases")
        .select("cardId")
        .where("cardNameAliases.normName", "=", normName)
        .executeTakeFirst();
    },

    // ── Delete by provider ──────────────────────────────────────────────────────

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

    // ── Accept new card from sources ─────────────────────────────────────────

    /**
     * Create a new card from source data,
     * then link all candidate_cards with the given normalized name to the new card.
     * Printings are accepted separately via acceptNewPrintingFromSource.
     */
    async acceptNewCardFromSources(
      cardFields: {
        id: string;
        name: string;
        type: CardType;
        superTypes?: SuperType[];
        domains: Domain[];
        might?: number | null;
        energy?: number | null;
        power?: number | null;
        mightBonus?: number | null;
        tags?: string[];
      },
      normalizedName: string,
    ): Promise<void> {
      const { id: cardUuid } = await db
        .insertInto("cards")
        .values({
          slug: cardFields.id,
          name: cardFields.name,
          type: cardFields.type,
          might: cardFields.might ?? null,
          energy: cardFields.energy ?? null,
          power: cardFields.power ?? null,
          mightBonus: cardFields.mightBonus ?? null,
          keywords: [],
          tags: cardFields.tags ?? [],
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      // Write domains to junction table
      if (cardFields.domains.length > 0) {
        await db
          .insertInto("cardDomains")
          .values(
            cardFields.domains.map((domain, index) => ({
              cardId: cardUuid,
              domainSlug: domain,
              ordinal: index,
            })),
          )
          .execute();
      }

      // Write super types to junction table
      const superTypes = cardFields.superTypes ?? [];
      if (superTypes.length > 0) {
        await db
          .insertInto("cardSuperTypes")
          .values(superTypes.map((superType) => ({ cardId: cardUuid, superTypeSlug: superType })))
          .execute();
      }

      await db
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId: cardUuid })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardUuid }))
        .execute();
    },

    /**
     * Create name aliases for every distinct spelling of the normalized name,
     * so that resolveCardId() can match candidate_cards to this card dynamically.
     */
    async createNameAliases(normalizedName: string, cardId: string): Promise<void> {
      await db
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId: cardId })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardId }))
        .execute();
    },

    // ── Card errata ──────────────────────────────────────────────────────────

    /**
     * Upsert card errata (insert or update on conflict by cardId).
     */
    async upsertCardErrata(
      cardId: string,
      data: {
        correctedRulesText: string | null;
        correctedEffectText: string | null;
        source: string;
        sourceUrl: string | null;
        effectiveDate: string | null;
      },
    ): Promise<void> {
      await db
        .insertInto("cardErrata")
        .values({
          cardId,
          correctedRulesText: data.correctedRulesText,
          correctedEffectText: data.correctedEffectText,
          source: data.source,
          sourceUrl: data.sourceUrl,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
        })
        .onConflict((oc) =>
          oc.column("cardId").doUpdateSet({
            correctedRulesText: data.correctedRulesText,
            correctedEffectText: data.correctedEffectText,
            source: data.source,
            sourceUrl: data.sourceUrl,
            effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
          }),
        )
        .execute();
    },

    /**
     * Delete card errata by card ID.
     */
    async deleteCardErrata(cardId: string): Promise<void> {
      await db.deleteFrom("cardErrata").where("cardId", "=", cardId).execute();
    },

    /**
     * Get card errata by card ID.
     * @returns Errata fields, or null if no errata exists.
     */
    async getCardErrata(cardId: string) {
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
  };
}
