import { extractKeywords } from "@openrift/shared/keywords";
import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  Rarity,
  SuperType,
} from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable, Transaction, UpdateResult } from "kysely";
import { sql } from "kysely";

import type {
  CandidateCardsTable,
  CardsTable,
  Database,
  CandidatePrintingsTable,
} from "../db/index.js";
import { resolveCardId } from "./query-helpers.js";

type Trx = Transaction<Database> | Kysely<Database>;

/**
 * Mutation queries for candidate cards, candidate printings, cards, and printings
 * used by the admin card-source management routes.
 *
 * @returns An object with mutation methods bound to the given `db`.
 */
export function candidateMutationsRepo(db: Kysely<Database>) {
  return {
    // ── Auto-check ────────────────────────────────────────────────────────────

    /**
     * Bulk auto-check candidate cards whose fields match their resolved card.
     * @returns Number of affected rows.
     */
    autoCheckCandidateCards(now: Date): Promise<{ numAffectedRows: bigint }> {
      const rcid = resolveCardId("cs");
      const n = (ref: string) => sql`COALESCE(NULLIF(${sql.ref(ref)}, ''), NULL)`;

      return sql`
        UPDATE candidate_cards cs
        SET checked_at = ${now}
        FROM cards c
        WHERE c.id = (${rcid})
          AND cs.checked_at IS NULL
          AND cs.name        IS NOT DISTINCT FROM c.name
          AND cs.type        IS NOT DISTINCT FROM c.type
          AND cs.super_types IS NOT DISTINCT FROM c.super_types
          AND cs.domains     IS NOT DISTINCT FROM c.domains
          AND cs.might       IS NOT DISTINCT FROM c.might
          AND cs.energy      IS NOT DISTINCT FROM c.energy
          AND cs.power       IS NOT DISTINCT FROM c.power
          AND cs.might_bonus IS NOT DISTINCT FROM c.might_bonus
          AND ${n("cs.rulesText")}  IS NOT DISTINCT FROM ${n("c.rulesText")}
          AND ${n("cs.effectText")} IS NOT DISTINCT FROM ${n("c.effectText")}
          AND cs.tags        IS NOT DISTINCT FROM c.tags
      `.execute(db) as Promise<{ numAffectedRows: bigint }>;
    },

    /**
     * Bulk auto-check candidate printings whose fields match their linked printing.
     * @returns Number of affected rows.
     */
    autoCheckCandidatePrintings(now: Date): Promise<{ numAffectedRows: bigint }> {
      const n = (ref: string) => sql`COALESCE(NULLIF(${sql.ref(ref)}, ''), NULL)`;

      return sql`
        UPDATE candidate_printings ps
        SET checked_at = ${now}
        FROM printings p
        LEFT JOIN sets s ON s.id = p.set_id
        WHERE ps.printing_id = p.id
          AND ps.checked_at IS NULL
          AND ps.short_code          IS NOT DISTINCT FROM p.short_code
          AND ps.set_id            IS NOT DISTINCT FROM s.slug
          AND ps.collector_number  IS NOT DISTINCT FROM p.collector_number
          AND LOWER(ps.rarity)     IS NOT DISTINCT FROM LOWER(p.rarity)
          AND ${n("ps.artVariant")}  IS NOT DISTINCT FROM ${n("p.artVariant")}
          AND ps.is_signed         IS NOT DISTINCT FROM p.is_signed
          AND ps.promo_type_id     IS NOT DISTINCT FROM p.promo_type_id
          AND ps.finish            IS NOT DISTINCT FROM p.finish
          AND COALESCE(ps.artist, '') IS NOT DISTINCT FROM p.artist
          AND ps.public_code       IS NOT DISTINCT FROM p.public_code
          AND ${n("ps.printedRulesText")}  IS NOT DISTINCT FROM ${n("p.printedRulesText")}
          AND ${n("ps.printedEffectText")} IS NOT DISTINCT FROM ${n("p.printedEffectText")}
          AND ${n("ps.flavorText")}         IS NOT DISTINCT FROM ${n("p.flavorText")}
      `.execute(db) as Promise<{ numAffectedRows: bigint }>;
    },

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
          collectorNumber: ps.collectorNumber,
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
          externalId: ps.externalId,
          extraData: ps.extraData,
        })
        .execute();
    },

    // ── Candidate printing linking ───────────────────────────────────────────────

    /** @returns A printing's slug by UUID. */
    getPrintingSlugById(id: string): Promise<{ slug: string } | undefined> {
      return db.selectFrom("printings").select("slug").where("id", "=", id).executeTakeFirst();
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

    /** Link candidate printings to a printing UUID and mark as checked. Used within transactions. */
    async linkAndCheckCandidatePrintings(
      candidatePrintingIds: string[],
      printingUuid: string,
      trx: Trx,
    ): Promise<void> {
      await trx
        .updateTable("candidatePrintings")
        .set({ printingId: printingUuid, checkedAt: new Date() })
        .where("id", "in", candidatePrintingIds)
        .execute();
    },

    /** Upsert printing link overrides for the given candidate printing IDs. */
    async upsertPrintingLinkOverrides(
      candidatePrintingIds: string[],
      printingSlug: string,
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
            printingSlug,
          })
          .onConflict((oc) => oc.columns(["externalId", "finish"]).doUpdateSet({ printingSlug }))
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

    /** Rename a card's slug. */
    async renameCardSlug(oldSlug: string, newSlug: string): Promise<void> {
      await db.updateTable("cards").set({ slug: newSlug }).where("slug", "=", oldSlug).execute();
    },

    /** @returns A card's rulesText and effectText by slug. */
    getCardTexts(
      slug: string,
    ): Promise<Pick<Selectable<CardsTable>, "rulesText" | "effectText"> | undefined> {
      return db
        .selectFrom("cards")
        .select(["rulesText", "effectText"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** Update arbitrary fields on a card by slug. */
    async updateCardBySlug(slug: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("cards").set(updates).where("slug", "=", slug).execute();
    },

    // ── Printing mutations ────────────────────────────────────────────────────

    /** Update a single field on a printing by slug. */
    async updatePrintingBySlug(slug: string, field: string, value: unknown): Promise<void> {
      await db
        .updateTable("printings")
        .set({ [field]: value })
        .where("slug", "=", slug)
        .execute();
    },

    /** Rename a printing's slug. */
    async renamePrintingSlug(oldSlug: string, newSlug: string): Promise<void> {
      await db
        .updateTable("printings")
        .set({ slug: newSlug })
        .where("slug", "=", oldSlug)
        .execute();
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

    /** @returns Set UUID by slug. Used within transactions. */
    getSetIdBySlug(slug: string, trx: Trx): Promise<{ id: string } | undefined> {
      return trx.selectFrom("sets").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /**
     * Insert or update a printing, used within transactions.
     * @returns The new or existing printing UUID.
     */
    async upsertPrinting(
      trx: Trx,
      values: {
        slug: string;
        cardId: string;
        setId: string;
        shortCode: string;
        collectorNumber: number;
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
      },
    ): Promise<string> {
      const result = await trx
        .insertInto("printings")
        .values(values)
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            publicCode: eb.ref("excluded.publicCode"),
            printedRulesText: eb.ref("excluded.printedRulesText"),
            printedEffectText: eb.ref("excluded.printedEffectText"),
            flavorText: eb.ref("excluded.flavorText"),
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
      trx: Transaction<Database>,
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
        rulesText?: string | null;
        effectText?: string | null;
        tags?: string[];
      },
      normalizedName: string,
    ): Promise<void> {
      const keywords = [
        ...extractKeywords(cardFields.rulesText ?? ""),
        ...extractKeywords(cardFields.effectText ?? ""),
      ].filter((v, i, a) => a.indexOf(v) === i);

      const { id: cardUuid } = await trx
        .insertInto("cards")
        .values({
          slug: cardFields.id,
          name: cardFields.name,
          type: cardFields.type,
          superTypes: cardFields.superTypes ?? [],
          domains: cardFields.domains,
          might: cardFields.might ?? null,
          energy: cardFields.energy ?? null,
          power: cardFields.power ?? null,
          mightBonus: cardFields.mightBonus ?? null,
          keywords,
          rulesText: cardFields.rulesText ?? null,
          effectText: cardFields.effectText ?? null,
          tags: cardFields.tags ?? [],
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId: cardUuid })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardUuid }))
        .execute();
    },

    /**
     * Create name aliases for every distinct spelling of the normalized name,
     * so that resolveCardId() can match candidate_cards to this card dynamically.
     */
    async createNameAliases(
      trx: Transaction<Database>,
      normalizedName: string,
      cardId: string,
    ): Promise<void> {
      await trx
        .insertInto("cardNameAliases")
        .values({ normName: normalizedName, cardId: cardId })
        .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardId }))
        .execute();
    },
  };
}
