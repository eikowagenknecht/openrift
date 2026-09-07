import type { Insertable, Kysely, Selectable } from "kysely";

import type {
  Database,
  UvsgamesDecklistCardsTable,
  UvsgamesDecklistsTable,
  UvsgamesEventMatchesTable,
  UvsgamesEventPhasesTable,
  UvsgamesEventStandingsTable,
} from "../../../db/index.js";
import { rowBatches } from "../../../lib/bind-batches.js";

/**
 * Keyed by the source's own ids, in the source's own vocabulary (unmapped
 * formats, unclassified tiers). Promotion turns this into live rows; a mapping fix can re-promote.
 */

export type UvsgamesStandingRow = Selectable<UvsgamesEventStandingsTable>;
export type UvsgamesPhaseRow = Selectable<UvsgamesEventPhasesTable>;
export type UvsgamesMatchRow = Selectable<UvsgamesEventMatchesTable>;
export type UvsgamesDecklistCardRow = Selectable<UvsgamesDecklistCardsTable>;

export interface UvsgamesDeckCoverage {
  outstanding: string[];
  held: number;
}

export function uvsgamesResultsRepo(db: Kysely<Database>) {
  return {
    standings(externalId: string): Promise<UvsgamesStandingRow[]> {
      return db
        .selectFrom("uvsgamesEventStandings")
        .selectAll()
        .where("externalId", "=", externalId)
        .orderBy("rank", "asc")
        .orderBy("registrationId", "asc")
        .execute();
    },

    // The registration key stays stable across a re-fetch, so nothing
    // downstream loses its identity when provisional ranks are corrected.
    async replaceStandings(
      externalId: string,
      rows: readonly Insertable<UvsgamesEventStandingsTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("uvsgamesEventStandings")
          .where("externalId", "=", externalId)
          .execute();
        for (const batch of rowBatches(rows)) {
          await trx.insertInto("uvsgamesEventStandings").values(batch).execute();
        }
      });
    },

    phases(externalId: string): Promise<UvsgamesPhaseRow[]> {
      return db
        .selectFrom("uvsgamesEventPhases")
        .selectAll()
        .where("externalId", "=", externalId)
        .orderBy("phaseOrder", "asc")
        .execute();
    },

    async replacePhases(
      externalId: string,
      rows: readonly Insertable<UvsgamesEventPhasesTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("uvsgamesEventPhases").where("externalId", "=", externalId).execute();
        for (const batch of rowBatches(rows)) {
          await trx.insertInto("uvsgamesEventPhases").values(batch).execute();
        }
      });
    },

    matches(externalId: string): Promise<UvsgamesMatchRow[]> {
      return db
        .selectFrom("uvsgamesEventMatches")
        .selectAll()
        .where("externalId", "=", externalId)
        .orderBy("phaseOrder", "asc")
        .orderBy("roundNumber", "asc")
        .orderBy("tableNumber", "asc")
        .execute();
    },

    // A completed round's pairings are immutable; the fetcher skips them.
    async heldRoundIds(externalId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("uvsgamesEventMatches")
        .select("roundId")
        .distinct()
        .where("externalId", "=", externalId)
        .execute();
      return rows.map((row) => row.roundId);
    },

    async replaceRoundMatches(
      externalId: string,
      roundId: string,
      rows: readonly Insertable<UvsgamesEventMatchesTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("uvsgamesEventMatches")
          .where("externalId", "=", externalId)
          .where("roundId", "=", roundId)
          .execute();
        for (const batch of rowBatches(rows)) {
          await trx.insertInto("uvsgamesEventMatches").values(batch).execute();
        }
      });
    },

    // A refused deck counts as held: the id was tried and came back
    // unreadable, and asking again would only spend the budget.
    async deckCoverage(externalId: string): Promise<UvsgamesDeckCoverage> {
      const referenced = await db
        .selectFrom("uvsgamesEventStandings")
        .select("sourceDeckId")
        .distinct()
        .where("externalId", "=", externalId)
        .where("sourceDeckId", "is not", null)
        .execute();
      const held = await db
        .selectFrom("uvsgamesDecklists")
        .select("sourceDeckId")
        .where("externalId", "=", externalId)
        .execute();
      const heldIds = new Set(held.map((row) => row.sourceDeckId));
      const outstanding = referenced
        .map((row) => row.sourceDeckId)
        .filter((id): id is string => id !== null && !heldIds.has(id));
      return { outstanding, held: heldIds.size };
    },

    async decklistCards(externalId: string): Promise<Map<string, UvsgamesDecklistCardRow[]>> {
      const rows = await db
        .selectFrom("uvsgamesDecklistCards")
        .innerJoin(
          "uvsgamesDecklists",
          "uvsgamesDecklists.sourceDeckId",
          "uvsgamesDecklistCards.sourceDeckId",
        )
        .selectAll("uvsgamesDecklistCards")
        .where("uvsgamesDecklists.externalId", "=", externalId)
        .orderBy("uvsgamesDecklistCards.lineNumber", "asc")
        .execute();
      return Map.groupBy(rows, (row) => row.sourceDeckId);
    },

    // Idempotent on the deck id: a second write of the same id replaces, not duplicates.
    async putDecklist(
      row: Insertable<UvsgamesDecklistsTable>,
      cards: readonly Omit<Insertable<UvsgamesDecklistCardsTable>, "sourceDeckId">[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("uvsgamesDecklists")
          .values(row)
          .onConflict((oc) =>
            oc.column("sourceDeckId").doUpdateSet({
              externalId: row.externalId,
              fetchStatus: row.fetchStatus,
              fetchedAt: row.fetchedAt,
            }),
          )
          .execute();
        await trx
          .deleteFrom("uvsgamesDecklistCards")
          .where("sourceDeckId", "=", row.sourceDeckId)
          .execute();
        for (const batch of rowBatches(
          cards.map((card) => ({ ...card, sourceDeckId: row.sourceDeckId })),
        )) {
          await trx.insertInto("uvsgamesDecklistCards").values(batch).execute();
        }
      });
    },
  };
}
