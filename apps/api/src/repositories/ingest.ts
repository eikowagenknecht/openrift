import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { CandidateCardsTable, Database, CandidatePrintingsTable } from "../db/index.js";

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

    /** @returns All candidate cards for a given provider name. */
    async allCandidateCardsForProvider(
      provider: string,
    ): Promise<Selectable<CandidateCardsTable>[]> {
      const rows = await db
        .selectFrom("candidateCards")
        .selectAll()
        .where("provider", "=", provider)
        .execute();
      // Without the parse, the ingest diff compares a JSON string against the
      // incoming object and flags extraData as changed on every re-ingest.
      return rows;
    },

    /** @returns All cards (id + normName) for name resolution. */
    allCardNorms(): Promise<{ id: string; normName: string }[]> {
      return db.selectFrom("cards").select(["id", "normName"]).execute();
    },

    /** @returns All card name aliases for fallback name resolution. */
    allCardNameAliases(): Promise<{ normName: string; cardId: string }[]> {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

    /** @returns All printings (id + shortCode + finish + markerSlugs + language) for composite-key resolution. */
    allPrintingKeys(): Promise<
      {
        id: string;
        shortCode: string;
        finish: string;
        markerSlugs: string[];
        language: string;
      }[]
    > {
      return db
        .selectFrom("printings")
        .select(["id", "shortCode", "finish", "markerSlugs", "language"])
        .execute();
    },

    /** @returns All candidate printings for the given candidate card IDs. */
    async candidatePrintingsByCandidateCardIds(
      candidateCardIds: string[],
    ): Promise<Selectable<CandidatePrintingsTable>[]> {
      const rows = await db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("candidateCardId", "in", candidateCardIds)
        .execute();
      return rows;
    },

    /**
     * All candidate printings not yet linked to an accepted printing, joined
     * with their candidate card's name so the relink pass can resolve the card
     * by normalized name the same way ingest does.
     * @returns Unlinked candidate printing rows with the owning card name.
     */
    allUnlinkedCandidatePrintings(): Promise<
      {
        id: string;
        shortCode: string;
        finish: string | null;
        markerSlugs: string[];
        language: string | null;
        externalId: string;
        cardName: string;
      }[]
    > {
      return db
        .selectFrom("candidatePrintings as cp")
        .innerJoin("candidateCards as cc", "cc.id", "cp.candidateCardId")
        .select([
          "cp.id",
          "cp.shortCode",
          "cp.finish",
          "cp.markerSlugs",
          "cp.language",
          "cp.externalId",
          "cc.name as cardName",
        ])
        .where("cp.printingId", "is", null)
        .execute();
    },

    /** @returns Ignored candidate card external IDs for a provider. */
    ignoredCandidateCards(provider: string): Promise<{ externalId: string }[]> {
      return db
        .selectFrom("ignoredCandidateCards")
        .select(["provider", "externalId"])
        .where("provider", "=", provider)
        .execute();
    },

    /** @returns All printing link overrides (manual links that survive re-uploads). */
    allPrintingLinkOverrides(): Promise<
      { externalId: string; finish: string; printingId: string }[]
    > {
      return db
        .selectFrom("printingLinkOverrides")
        .select(["externalId", "finish", "printingId"])
        .execute();
    },

    /** @returns Ignored candidate printing entries for a provider. */
    ignoredCandidatePrintings(
      provider: string,
    ): Promise<{ externalId: string; finish: string | null }[]> {
      return db
        .selectFrom("ignoredCandidatePrintings")
        .select(["provider", "externalId", "finish"])
        .where("provider", "=", provider)
        .execute();
    },

    /**
     * Count a user's in-app submission candidates created since a cutoff.
     * Backs the ADR-036 per-user daily cap. Counts only rows still present in
     * `candidate_cards` (pending review) — accepted/rejected submissions have
     * left the table, a deliberate leniency toward contributors whose earlier
     * submissions were already processed.
     * @returns The number of candidate cards submitted by the user since `since`.
     */
    async countRecentSubmissionsByUser(userId: string, since: Date): Promise<number> {
      const row = await db
        .selectFrom("candidateCards")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("submittedByUserId", "=", userId)
        .where("createdAt", ">=", since)
        .executeTakeFirst();
      return row ? Number(row.count) : 0;
    },

    /**
     * Serialize this user's submission ingests for the rest of the enclosing
     * transaction. A plain COUNT under READ COMMITTED can't see concurrent
     * uncommitted inserts, so without this lock N parallel submissions all
     * pass the daily-cap check together. The lock releases automatically at
     * transaction end; other users hash to different keys and don't block.
     * Must be called inside a transaction.
     */
    async lockUserSubmissions(userId: string): Promise<void> {
      await sql`select pg_advisory_xact_lock(hashtext(${userId}))`.execute(db);
    },

    // ── Writes ──────────────────────────────────────────────────────────────

    /** Update a candidate card by ID. */
    async updateCandidateCard(id: string, updates: Updateable<CandidateCardsTable>): Promise<void> {
      await db.updateTable("candidateCards").set(updates).where("id", "=", id).execute();
    },

    /**
     * Insert a new candidate card.
     * @returns The inserted candidate card ID.
     */
    async insertCandidateCard(values: Insertable<CandidateCardsTable>): Promise<string> {
      const [inserted] = await db
        .insertInto("candidateCards")
        .values(values)
        .returning("id")
        .execute();
      return inserted.id;
    },

    /** Update a candidate printing by ID. */
    async updateCandidatePrinting(
      id: string,
      updates: Updateable<CandidatePrintingsTable>,
    ): Promise<void> {
      await db.updateTable("candidatePrintings").set(updates).where("id", "=", id).execute();
    },

    /** Insert a new candidate printing. */
    async insertCandidatePrinting(values: Insertable<CandidatePrintingsTable>): Promise<void> {
      await db.insertInto("candidatePrintings").values(values).execute();
    },

    /** Delete candidate cards by IDs. */
    async deleteCandidateCards(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidateCards").where("id", "in", ids).execute();
    },

    /** Delete candidate printings by IDs. */
    async deleteCandidatePrintings(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidatePrintings").where("id", "in", ids).execute();
    },
  };
}
