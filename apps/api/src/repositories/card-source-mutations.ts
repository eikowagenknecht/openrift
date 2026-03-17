import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import type { DeleteResult, Kysely, Selectable, Transaction, UpdateResult } from "kysely";
import { sql } from "kysely";

import { resolveCardId } from "../db-helpers.js";
import type { CardSourcesTable, CardsTable, Database, PrintingSourcesTable } from "../db/index.js";

type Trx = Transaction<Database> | Kysely<Database>;

/**
 * Mutation queries for card sources, printing sources, cards, and printings
 * used by the admin card-source management routes.
 *
 * @returns An object with mutation methods bound to the given `db`.
 */
export function cardSourceMutationsRepo(db: Kysely<Database>) {
  return {
    // ── Auto-check ────────────────────────────────────────────────────────────

    /**
     * Bulk auto-check card sources whose fields match their resolved card.
     * @returns Number of affected rows.
     */
    autoCheckCardSources(now: Date): Promise<{ numAffectedRows: bigint }> {
      const rcid = resolveCardId("cs");
      const n = (ref: string) => sql`COALESCE(NULLIF(${sql.ref(ref)}, ''), NULL)`;

      return sql`
        UPDATE card_sources cs
        SET checked_at = ${now}, updated_at = ${now}
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
     * Bulk auto-check printing sources whose fields match their linked printing.
     * @returns Number of affected rows.
     */
    autoCheckPrintingSources(now: Date): Promise<{ numAffectedRows: bigint }> {
      const n = (ref: string) => sql`COALESCE(NULLIF(${sql.ref(ref)}, ''), NULL)`;

      return sql`
        UPDATE printing_sources ps
        SET checked_at = ${now}, updated_at = ${now}
        FROM printings p
        LEFT JOIN sets s ON s.id = p.set_id
        WHERE ps.printing_id = p.id
          AND ps.checked_at IS NULL
          AND ps.source_id         IS NOT DISTINCT FROM p.source_id
          AND ps.set_id            IS NOT DISTINCT FROM s.slug
          AND ps.collector_number  IS NOT DISTINCT FROM p.collector_number
          AND LOWER(ps.rarity)     IS NOT DISTINCT FROM LOWER(p.rarity)
          AND ${n("ps.artVariant")}  IS NOT DISTINCT FROM ${n("p.artVariant")}
          AND ps.is_signed         IS NOT DISTINCT FROM p.is_signed
          AND ps.is_promo          IS NOT DISTINCT FROM p.is_promo
          AND ps.finish            IS NOT DISTINCT FROM p.finish
          AND COALESCE(ps.artist, '') IS NOT DISTINCT FROM p.artist
          AND ps.public_code       IS NOT DISTINCT FROM p.public_code
          AND ${n("ps.printedRulesText")}  IS NOT DISTINCT FROM ${n("p.printedRulesText")}
          AND ${n("ps.printedEffectText")} IS NOT DISTINCT FROM ${n("p.printedEffectText")}
          AND ${n("ps.flavorText")}         IS NOT DISTINCT FROM ${n("p.flavorText")}
      `.execute(db) as Promise<{ numAffectedRows: bigint }>;
    },

    // ── Card source checks ────────────────────────────────────────────────────

    /**
     * Mark a single card source as checked.
     * @returns Update result.
     */
    checkCardSource(cardSourceId: string): Promise<UpdateResult> {
      return db
        .updateTable("cardSources")
        .set({ checkedAt: new Date(), updatedAt: new Date() })
        .where("id", "=", cardSourceId)
        .executeTakeFirst();
    },

    /**
     * Clear checked_at on a single card source.
     * @returns Update result.
     */
    uncheckCardSource(cardSourceId: string): Promise<UpdateResult> {
      return db
        .updateTable("cardSources")
        .set({ checkedAt: null, updatedAt: new Date() })
        .where("id", "=", cardSourceId)
        .executeTakeFirst();
    },

    /**
     * Mark all card sources with matching normalized names OR linked to the
     * given card via printing_sources → printings as checked.
     * @returns The total number of rows updated.
     */
    async checkAllCardSources(normNames: string[], cardId: string): Promise<number> {
      const now = new Date();
      const linkedIds = db
        .selectFrom("printingSources")
        .innerJoin("printings", "printings.id", "printingSources.printingId")
        .select("printingSources.cardSourceId")
        .where("printings.cardId", "=", cardId);

      const results = await db
        .updateTable("cardSources")
        .set({ checkedAt: now, updatedAt: now })
        .where((eb) =>
          eb.or([
            eb("cardSources.normName", "in", normNames),
            eb("cardSources.id", "in", linkedIds),
          ]),
        )
        .where("checkedAt", "is", null)
        .execute();
      return results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    },

    // ── Printing source checks ────────────────────────────────────────────────

    /**
     * Mark a single printing source as checked.
     * @returns Update result.
     */
    checkPrintingSource(id: string): Promise<UpdateResult> {
      return db
        .updateTable("printingSources")
        .set({ checkedAt: new Date(), updatedAt: new Date() })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Clear checked_at on a single printing source.
     * @returns Update result.
     */
    uncheckPrintingSource(id: string): Promise<UpdateResult> {
      return db
        .updateTable("printingSources")
        .set({ checkedAt: null, updatedAt: new Date() })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Mark all printing sources for a given printing (and optional extra IDs) as checked.
     * @returns The total number of rows updated.
     */
    async checkAllPrintingSources(printingId: string, extraIds?: string[]): Promise<number> {
      const results = await db
        .updateTable("printingSources")
        .set({ checkedAt: new Date(), updatedAt: new Date() })
        .where((eb) =>
          eb.or([
            eb("printingId", "=", printingId),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checkedAt", "is", null)
        .execute();
      return results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    },

    // ── Printing source mutations ─────────────────────────────────────────────

    /**
     * Patch allowed fields on a printing source.
     * @returns Update result.
     */
    patchPrintingSource(id: string, updates: Record<string, unknown>): Promise<UpdateResult> {
      return db
        .updateTable("printingSources")
        .set({ ...updates, updatedAt: new Date() })
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Delete a printing source by ID.
     * @returns Delete result.
     */
    deletePrintingSource(id: string): Promise<DeleteResult> {
      return db.deleteFrom("printingSources").where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing source by ID (all columns). */
    getPrintingSourceById(id: string): Promise<Selectable<PrintingSourcesTable> | undefined> {
      return db.selectFrom("printingSources").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing's differentiator fields by slug. */
    getPrintingDifferentiatorsBySlug(slug: string) {
      return db
        .selectFrom("printings")
        .select(["id", "finish", "artVariant", "isSigned", "isPromo", "rarity"])
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /** Copy a printing source and link it to a different printing. */
    async copyPrintingSource(
      ps: Selectable<PrintingSourcesTable>,
      target: {
        id: string;
        rarity: string | null;
        artVariant: string | null;
        isSigned: boolean;
        isPromo: boolean;
        finish: string;
      },
    ): Promise<void> {
      await db
        .insertInto("printingSources")
        .values({
          cardSourceId: ps.cardSourceId,
          printingId: target.id,
          sourceId: ps.sourceId,
          setId: ps.setId,
          setName: ps.setName,
          collectorNumber: ps.collectorNumber,
          rarity: target.rarity as Rarity | null,
          artVariant: target.artVariant as ArtVariant | null,
          isSigned: target.isSigned,
          isPromo: target.isPromo,
          finish: target.finish as Finish,
          artist: ps.artist,
          publicCode: ps.publicCode,
          printedRulesText: ps.printedRulesText,
          printedEffectText: ps.printedEffectText,
          imageUrl: ps.imageUrl,
          flavorText: ps.flavorText,
          sourceEntityId: ps.sourceEntityId,
          extraData: ps.extraData,
        })
        .execute();
    },

    // ── Printing source linking ───────────────────────────────────────────────

    /** @returns A printing's UUID by slug. */
    getPrintingIdBySlug(slug: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("printings").select("id").where("slug", "=", slug).executeTakeFirst();
    },

    /** Bulk-link (or unlink) printing sources to a printing UUID. */
    async linkPrintingSources(
      printingSourceIds: string[],
      printingUuid: string | null,
    ): Promise<void> {
      await db
        .updateTable("printingSources")
        .set({ printingId: printingUuid, updatedAt: new Date() })
        .where("id", "in", printingSourceIds)
        .execute();
    },

    /** Link printing sources to a printing UUID and mark as checked. Used within transactions. */
    async linkAndCheckPrintingSources(
      printingSourceIds: string[],
      printingUuid: string,
      trx: Trx,
    ): Promise<void> {
      await trx
        .updateTable("printingSources")
        .set({ printingId: printingUuid, checkedAt: new Date(), updatedAt: new Date() })
        .where("id", "in", printingSourceIds)
        .execute();
    },

    /** Upsert printing link overrides for the given printing source IDs. */
    async upsertPrintingLinkOverrides(
      printingSourceIds: string[],
      printingSlug: string,
    ): Promise<void> {
      const rows = await db
        .selectFrom("printingSources")
        .select(["sourceEntityId", "finish"])
        .where("id", "in", printingSourceIds)
        .execute();
      for (const row of rows) {
        await db
          .insertInto("printingLinkOverrides")
          .values({
            sourceEntityId: row.sourceEntityId,
            finish: row.finish ?? "",
            printingSlug,
          })
          .onConflict((oc) =>
            oc.columns(["sourceEntityId", "finish"]).doUpdateSet({ printingSlug }),
          )
          .execute();
      }
    },

    /** Remove printing link overrides for the given printing source IDs (unlink). */
    async removePrintingLinkOverrides(printingSourceIds: string[]): Promise<void> {
      const rows = await db
        .selectFrom("printingSources")
        .select(["sourceEntityId", "finish"])
        .where("id", "in", printingSourceIds)
        .execute();
      if (rows.length === 0) {
        return;
      }
      for (const row of rows) {
        await db
          .deleteFrom("printingLinkOverrides")
          .where("sourceEntityId", "=", row.sourceEntityId)
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
      await db
        .updateTable("cards")
        .set({ slug: newSlug, updatedAt: new Date() })
        .where("slug", "=", oldSlug)
        .execute();
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
      await db
        .updateTable("cards")
        .set({ ...updates, updatedAt: new Date() })
        .where("slug", "=", slug)
        .execute();
    },

    // ── Printing mutations ────────────────────────────────────────────────────

    /** Update a single field on a printing by slug. */
    async updatePrintingBySlug(slug: string, field: string, value: unknown): Promise<void> {
      await db
        .updateTable("printings")
        .set({ [field]: value, updatedAt: new Date() })
        .where("slug", "=", slug)
        .execute();
    },

    /** Rename a printing's slug. */
    async renamePrintingSlug(oldSlug: string, newSlug: string): Promise<void> {
      await db
        .updateTable("printings")
        .set({ slug: newSlug, updatedAt: new Date() })
        .where("slug", "=", oldSlug)
        .execute();
    },

    // ── Accept printing ───────────────────────────────────────────────────────

    /** @returns The source name from the card_source linked to a printing_source. */
    getSourceNameForPrintingSource(
      printingSourceId: string,
    ): Promise<{ source: string } | undefined> {
      return db
        .selectFrom("printingSources")
        .innerJoin("cardSources", "cardSources.id", "printingSources.cardSourceId")
        .select("cardSources.source")
        .where("printingSources.id", "=", printingSourceId)
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
        sourceId: string;
        collectorNumber: number;
        rarity: Rarity;
        artVariant: ArtVariant;
        isSigned: boolean;
        isPromo: boolean;
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

    /** @returns Card source name and source for a card source ID. */
    getCardSourceNameAndSource(
      id: string,
    ): Promise<Pick<Selectable<CardSourcesTable>, "name" | "source"> | undefined> {
      return db
        .selectFrom("cardSources")
        .select(["name", "source"])
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

    // ── Delete by source ──────────────────────────────────────────────────────

    /**
     * Delete all card sources for a given source name.
     * @returns Number of deleted rows.
     */
    async deleteBySource(source: string): Promise<number> {
      const result = await db.deleteFrom("cardSources").where("source", "=", source).execute();
      return Number(result[0].numDeletedRows);
    },
  };
}
