import type { Insertable, Kysely, Selectable } from "kysely";

import type {
  Database,
  PlayloltcgDecklistCardsTable,
  PlayloltcgDecklistsTable,
  PlayloltcgEventStandingsTable,
} from "../db/index.js";

/**
 * What a playloltcg deep fetch read, as the source published it.
 *
 * Same contract as `uvsgamesResultsRepo` on a smaller surface: this source
 * publishes standings and decks, but no per-round pairings and no phase
 * structure, so it has neither table.
 */

export type PlayloltcgStandingRow = Selectable<PlayloltcgEventStandingsTable>;
export type PlayloltcgDecklistRow = Selectable<PlayloltcgDecklistsTable>;
export type PlayloltcgDecklistCardRow = Selectable<PlayloltcgDecklistCardsTable>;

export interface PlayloltcgDeckCoverage {
  outstanding: string[];
  held: number;
}

export function playloltcgResultsRepo(db: Kysely<Database>) {
  return {
    standings(activityShopId: number): Promise<PlayloltcgStandingRow[]> {
      return db
        .selectFrom("playloltcgEventStandings")
        .selectAll()
        .where("activityShopId", "=", activityShopId)
        .orderBy("rank", "asc")
        .orderBy("playerKey", "asc")
        .execute();
    },

    /**
     * Wholesale, because the source re-ranks provisional standings into final
     * ones. `playerKey` is what survives that, which is why it is the key
     * instead of the placement.
     */
    async replaceStandings(
      activityShopId: number,
      rows: readonly Insertable<PlayloltcgEventStandingsTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("playloltcgEventStandings")
          .where("activityShopId", "=", activityShopId)
          .execute();
        if (rows.length > 0) {
          await trx
            .insertInto("playloltcgEventStandings")
            .values([...rows])
            .execute();
        }
      });
    },

    async deckCoverage(activityShopId: number): Promise<PlayloltcgDeckCoverage> {
      const referenced = await db
        .selectFrom("playloltcgEventStandings")
        .select("sourceDeckId")
        .distinct()
        .where("activityShopId", "=", activityShopId)
        .where("sourceDeckId", "is not", null)
        .execute();
      const held = await db
        .selectFrom("playloltcgDecklists")
        .select("sourceDeckId")
        .where("activityShopId", "=", activityShopId)
        .execute();
      const heldIds = new Set(held.map((row) => row.sourceDeckId));
      const outstanding = referenced
        .map((row) => row.sourceDeckId)
        .filter((id): id is string => id !== null && !heldIds.has(id));
      return { outstanding, held: heldIds.size };
    },

    /** Deck ids already held, fetched or refused, so a pass never re-requests one. */
    async heldDeckIds(activityShopId: number): Promise<Set<string>> {
      const held = await db
        .selectFrom("playloltcgDecklists")
        .select("sourceDeckId")
        .where("activityShopId", "=", activityShopId)
        .execute();
      return new Set(held.map((row) => row.sourceDeckId));
    },

    async decklistCards(activityShopId: number): Promise<Map<string, PlayloltcgDecklistCardRow[]>> {
      const rows = await db
        .selectFrom("playloltcgDecklistCards")
        .innerJoin(
          "playloltcgDecklists",
          "playloltcgDecklists.sourceDeckId",
          "playloltcgDecklistCards.sourceDeckId",
        )
        .selectAll("playloltcgDecklistCards")
        .where("playloltcgDecklists.activityShopId", "=", activityShopId)
        .orderBy("playloltcgDecklistCards.lineNumber", "asc")
        .execute();
      return Map.groupBy(rows, (row) => row.sourceDeckId);
    },

    async putDecklist(
      row: Insertable<PlayloltcgDecklistsTable>,
      cards: readonly Omit<Insertable<PlayloltcgDecklistCardsTable>, "sourceDeckId">[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("playloltcgDecklists")
          .values(row)
          .onConflict((oc) =>
            oc.column("sourceDeckId").doUpdateSet({
              activityShopId: row.activityShopId,
              fetchStatus: row.fetchStatus,
              fetchedAt: row.fetchedAt,
            }),
          )
          .execute();
        await trx
          .deleteFrom("playloltcgDecklistCards")
          .where("sourceDeckId", "=", row.sourceDeckId)
          .execute();
        if (cards.length > 0) {
          await trx
            .insertInto("playloltcgDecklistCards")
            .values(cards.map((card) => ({ ...card, sourceDeckId: row.sourceDeckId })))
            .execute();
        }
      });
    },
  };
}
