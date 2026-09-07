import { WellKnown } from "@openrift/shared/well-known";
import type { Insertable, Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
} from "../../../db/tables/candidates.js";

type Db = Kysely<Database>;

// Designed to be instantiated with a transaction for all-or-nothing ingestion.
export function ingestRepo(db: Db) {
  return {
    /**
     * `extraData` comes back as the parsed object the ingest diff compares
     * against — jsonb params are passed as plain values and postgres.js does
     * the serializing, so nothing writes JSON text into the column for a read
     * to undo.
     */
    async allCandidateCardsForProvider(
      provider: string,
    ): Promise<Selectable<CandidateCardsTable>[]> {
      return await db
        .selectFrom("candidateCards")
        .selectAll()
        .where("provider", "=", provider)
        .execute();
    },

    allCardNorms(): Promise<{ id: string; normName: string }[]> {
      return db.selectFrom("cards").select(["id", "normName"]).execute();
    },

    allCardNameAliases(): Promise<{ normName: string; cardId: string }[]> {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

    /** The whole catalog as `inferChosenChampion` reads it: one row per card. */
    allCardChampionFacts(): Promise<
      { id: string; tags: string[]; isChampion: boolean; maxCopiesOverride: number | null }[]
    > {
      return db
        .selectFrom("cards")
        .select((eb) => [
          "cards.id",
          "cards.tags",
          "cards.maxCopiesOverride",
          eb
            .exists(
              eb
                .selectFrom("cardSuperTypes")
                .select("cardSuperTypes.cardId")
                .whereRef("cardSuperTypes.cardId", "=", "cards.id")
                .where("cardSuperTypes.superTypeSlug", "=", WellKnown.superType.CHAMPION),
            )
            .$castTo<boolean>()
            .as("isChampion"),
        ])
        .execute();
    },

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

    // Joined with the candidate card's name so the relink pass can resolve
    // the card by normalized name the same way ingest does.
    allUnlinkedCandidatePrintings(): Promise<
      {
        id: string;
        shortCode: string;
        finish: string | null;
        markerSlugs: string[];
        language: string | null;
        externalId: string;
        cardName: string;
        provider: string;
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
          "cc.provider",
        ])
        .where("cp.printingId", "is", null)
        .execute();
    },

    ignoredCandidateCards(provider: string): Promise<{ externalId: string }[]> {
      return db
        .selectFrom("ignoredCandidateCards")
        .select(["provider", "externalId"])
        .where("provider", "=", provider)
        .execute();
    },

    // `provider` scopes a pin to one source; '' is the legacy wildcard that
    // applies to every provider.
    allPrintingLinkOverrides(): Promise<
      { externalId: string; finish: string; provider: string; printingId: string }[]
    > {
      return db
        .selectFrom("printingLinkOverrides")
        .select(["externalId", "finish", "provider", "printingId"])
        .execute();
    },

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
     * Backs the per-user daily submission cap. Counts only rows still present
     * in `candidate_cards` (pending review) — accepted/rejected submissions
     * have left the table, a deliberate leniency toward contributors whose
     * earlier submissions were already processed.
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

    async updateCandidateCard(id: string, updates: Updateable<CandidateCardsTable>): Promise<void> {
      await db.updateTable("candidateCards").set(updates).where("id", "=", id).execute();
    },

    async insertCandidateCard(values: Insertable<CandidateCardsTable>): Promise<string> {
      const inserted = await db
        .insertInto("candidateCards")
        .values(values)
        .returning("id")
        .executeTakeFirstOrThrow();
      return inserted.id;
    },

    async updateCandidatePrinting(
      id: string,
      updates: Updateable<CandidatePrintingsTable>,
    ): Promise<void> {
      await db.updateTable("candidatePrintings").set(updates).where("id", "=", id).execute();
    },

    async insertCandidatePrinting(values: Insertable<CandidatePrintingsTable>): Promise<void> {
      await db.insertInto("candidatePrintings").values(values).execute();
    },

    async deleteCandidateCards(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidateCards").where("id", "in", ids).execute();
    },

    async deleteCandidatePrintings(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.deleteFrom("candidatePrintings").where("id", "in", ids).execute();
    },
  };
}
