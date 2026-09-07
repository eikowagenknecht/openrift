import type { Insertable, Kysely, Selectable } from "kysely";

import type {
  Database,
  PlayloltcgDecklistCardsTable,
  PlayloltcgDecklistsTable,
  PlayloltcgEventStandingsTable,
} from "../db/index.js";
import { rowBatches } from "../lib/bind-batches.js";

// This source publishes standings and decks, but no per-round pairings and no
// phase structure, so it has neither table.

export type PlayloltcgStandingRow = Selectable<PlayloltcgEventStandingsTable>;
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

    /** Wholesale, because the source re-ranks provisional standings into final ones. */
    async replaceStandings(
      activityShopId: number,
      rows: readonly Insertable<PlayloltcgEventStandingsTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("playloltcgEventStandings")
          .where("activityShopId", "=", activityShopId)
          .execute();
        for (const batch of rowBatches(rows)) {
          await trx.insertInto("playloltcgEventStandings").values(batch).execute();
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
        for (const batch of rowBatches(
          cards.map((card) => ({ ...card, sourceDeckId: row.sourceDeckId })),
        )) {
          await trx.insertInto("playloltcgDecklistCards").values(batch).execute();
        }
      });
    },
  };
}
