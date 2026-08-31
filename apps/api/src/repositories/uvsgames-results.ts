import type { Insertable, Kysely, Selectable } from "kysely";

import type {
  Database,
  UvsgamesDecklistCardsTable,
  UvsgamesDecklistsTable,
  UvsgamesEventMatchesTable,
  UvsgamesEventPhasesTable,
  UvsgamesEventStandingsTable,
} from "../db/index.js";

/**
 * What a uvsgames deep fetch read, as the source published it (ADR-014
 * revision 3).
 *
 * Everything here is keyed by the source's own ids and holds the source's own
 * vocabulary: card names are strings, no format is mapped and no tier is
 * classified. Promotion is what turns any of it into live rows, which is what
 * lets a mapping fix be a re-promote instead of a re-fetch. No response body
 * is stored: an unprojected field is discarded on arrival.
 */

export type UvsgamesStandingRow = Selectable<UvsgamesEventStandingsTable>;
export type UvsgamesPhaseRow = Selectable<UvsgamesEventPhasesTable>;
export type UvsgamesMatchRow = Selectable<UvsgamesEventMatchesTable>;
export type UvsgamesDecklistCardRow = Selectable<UvsgamesDecklistCardsTable>;

/** One event's deck coverage, for the recheck ladder's "are we done here" test. */
export interface UvsgamesDeckCoverage {
  /** Registrations naming a deck the source has not served yet. */
  outstanding: string[];
  /** Deck ids already held, whether fetched or refused. */
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

    /**
     * Replaces the whole field in one transaction. A re-fetch of a running
     * event corrects provisional ranks wholesale, and the registration key is
     * stable across that, so nothing downstream loses its identity.
     */
    async replaceStandings(
      externalId: string,
      rows: readonly Insertable<UvsgamesEventStandingsTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("uvsgamesEventStandings")
          .where("externalId", "=", externalId)
          .execute();
        if (rows.length > 0) {
          await trx
            .insertInto("uvsgamesEventStandings")
            .values([...rows])
            .execute();
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
        if (rows.length > 0) {
          await trx
            .insertInto("uvsgamesEventPhases")
            .values([...rows])
            .execute();
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

    /**
     * The rounds already held. A completed round's pairings are immutable, so
     * the fetcher skips these rather than asking again.
     */
    async heldRoundIds(externalId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("uvsgamesEventMatches")
        .select("roundId")
        .distinct()
        .where("externalId", "=", externalId)
        .execute();
      return rows.map((row) => row.roundId);
    },

    /** Per round, so a mid-event capture is corrected without disturbing its neighbours. */
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
        if (rows.length > 0) {
          await trx
            .insertInto("uvsgamesEventMatches")
            .values([...rows])
            .execute();
        }
      });
    },

    /**
     * Which decks this event still owes, and how many it holds. A refused deck
     * counts as held: the id was tried and came back unreadable, and asking
     * again would only spend the budget.
     */
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

    /** The lines of every deck this event holds, keyed by the source's deck id. */
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

    /**
     * Records one deck and its lines, or the fact that the source refused it.
     *
     * Idempotent on the deck id: a published list never changes, so a second
     * write of the same id replaces rather than duplicates.
     */
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
        if (cards.length > 0) {
          await trx
            .insertInto("uvsgamesDecklistCards")
            .values(cards.map((card) => ({ ...card, sourceDeckId: row.sourceDeckId })))
            .execute();
        }
      });
    },
  };
}
