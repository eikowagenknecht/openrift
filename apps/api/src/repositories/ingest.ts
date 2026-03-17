import type { Kysely, Selectable } from "kysely";

import type { CardSourcesTable, Database, PrintingSourcesTable } from "../db/index.js";

type Db = Kysely<Database>;

/**
 * Bulk-read and write queries for the card source ingestion pipeline.
 * Designed to be instantiated with a transaction for all-or-nothing ingestion.
 *
 * @returns An object with ingest query methods bound to the given `db`.
 */
export function ingestRepo(db: Db) {
  return {
    // ── Bulk reads ────────────────────────────────────────────────────────────

    /** @returns All card sources for a given source name. */
    allCardSourcesForSource(source: string): Promise<Selectable<CardSourcesTable>[]> {
      return db.selectFrom("cardSources").selectAll().where("source", "=", source).execute();
    },

    /** @returns All cards (id + normName) for name resolution. */
    allCardNorms(): Promise<{ id: string; normName: string }[]> {
      return db.selectFrom("cards").select(["id", "normName"]).execute();
    },

    /** @returns All card name aliases for fallback name resolution. */
    allCardNameAliases(): Promise<{ normName: string; cardId: string }[]> {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

    /** @returns All printings (id + slug) for slug-based resolution. */
    allPrintingSlugs(): Promise<{ id: string; slug: string }[]> {
      return db.selectFrom("printings").select(["id", "slug"]).execute();
    },

    /** @returns All printing sources for the given card source IDs. */
    printingSourcesByCardSourceIds(
      cardSourceIds: string[],
    ): Promise<Selectable<PrintingSourcesTable>[]> {
      return db
        .selectFrom("printingSources")
        .selectAll()
        .where("cardSourceId", "in", cardSourceIds)
        .execute();
    },

    /** @returns Ignored card source entity IDs for a source. */
    ignoredCardSources(source: string): Promise<{ sourceEntityId: string }[]> {
      return db
        .selectFrom("ignoredCardSources")
        .select(["source", "sourceEntityId"])
        .where("source", "=", source)
        .execute();
    },

    /** @returns Ignored printing source entries for a source. */
    ignoredPrintingSources(
      source: string,
    ): Promise<{ sourceEntityId: string; finish: string | null }[]> {
      return db
        .selectFrom("ignoredPrintingSources")
        .select(["source", "sourceEntityId", "finish"])
        .where("source", "=", source)
        .execute();
    },

    // ── Writes ──────────────────────────────────────────────────────────────

    /** Update a card source by ID. */
    async updateCardSource(id: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("cardSources").set(updates).where("id", "=", id).execute();
    },

    /**
     * Insert a new card source.
     * @returns The inserted card source ID.
     */
    async insertCardSource(values: Record<string, unknown>): Promise<string> {
      const [inserted] = await db
        .insertInto("cardSources")
        // oxlint-disable-next-line typescript/no-explicit-any -- optional fields built dynamically
        .values(values as any)
        .returning("id")
        .execute();
      return inserted.id;
    },

    /** Update a printing source by ID. */
    async updatePrintingSource(id: string, updates: Record<string, unknown>): Promise<void> {
      await db.updateTable("printingSources").set(updates).where("id", "=", id).execute();
    },

    /** Insert a new printing source. */
    async insertPrintingSource(values: Record<string, unknown>): Promise<void> {
      await db
        .insertInto("printingSources")
        // oxlint-disable-next-line typescript/no-explicit-any -- spread fields typed separately
        .values(values as any)
        .execute();
    },
  };
}
