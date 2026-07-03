import type { Insertable, Kysely, Selectable, Updateable } from "kysely";

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
    allCandidateCardsForProvider(provider: string): Promise<Selectable<CandidateCardsTable>[]> {
      return db.selectFrom("candidateCards").selectAll().where("provider", "=", provider).execute();
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
    candidatePrintingsByCandidateCardIds(
      candidateCardIds: string[],
    ): Promise<Selectable<CandidatePrintingsTable>[]> {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("candidateCardId", "in", candidateCardIds)
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
