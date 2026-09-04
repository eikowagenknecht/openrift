import type { Insertable, Kysely, Selectable } from "kysely";

import type {
  Database,
  TopdeckDecklistCardsTable,
  TopdeckDecklistsTable,
  TopdeckEventStandingsTable,
} from "../db/index.js";
import { rowBatches } from "../lib/bind-batches.js";

/**
 * The search body carries standings and lists together, so there is no coverage
 * question and nothing to re-request. The source publishes no per-round
 * pairings and no phase structure, so neither has a table.
 */

export type TopdeckStandingRow = Selectable<TopdeckEventStandingsTable>;
export type TopdeckDecklistCardRow = Selectable<TopdeckDecklistCardsTable>;

export function topdeckResultsRepo(db: Kysely<Database>) {
  return {
    standings(tid: string): Promise<TopdeckStandingRow[]> {
      return db
        .selectFrom("topdeckEventStandings")
        .selectAll()
        .where("tid", "=", tid)
        .orderBy("rank", "asc")
        .orderBy("playerKey", "asc")
        .execute();
    },

    /** Wholesale: the source re-ranks provisional standings into final ones, so `playerKey` is the key and not the placement. */
    async replaceStandings(
      tid: string,
      rows: readonly Insertable<TopdeckEventStandingsTable>[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("topdeckEventStandings").where("tid", "=", tid).execute();
        for (const batch of rowBatches(rows)) {
          await trx.insertInto("topdeckEventStandings").values(batch).execute();
        }
      });
    },

    async decklistCards(tid: string): Promise<Map<string, TopdeckDecklistCardRow[]>> {
      const rows = await db
        .selectFrom("topdeckDecklistCards")
        .innerJoin(
          "topdeckDecklists",
          "topdeckDecklists.sourceDeckId",
          "topdeckDecklistCards.sourceDeckId",
        )
        .selectAll("topdeckDecklistCards")
        .where("topdeckDecklists.tid", "=", tid)
        .orderBy("topdeckDecklistCards.lineNumber", "asc")
        .execute();
      return Map.groupBy(rows, (row) => row.sourceDeckId);
    },

    async putDecklist(
      row: Insertable<TopdeckDecklistsTable>,
      cards: readonly Omit<Insertable<TopdeckDecklistCardsTable>, "sourceDeckId">[],
    ): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("topdeckDecklists")
          .values(row)
          .onConflict((oc) =>
            oc.column("sourceDeckId").doUpdateSet({
              tid: row.tid,
              fetchStatus: row.fetchStatus,
              fetchedAt: row.fetchedAt,
            }),
          )
          .execute();
        await trx
          .deleteFrom("topdeckDecklistCards")
          .where("sourceDeckId", "=", row.sourceDeckId)
          .execute();
        for (const batch of rowBatches(
          cards.map((card) => ({ ...card, sourceDeckId: row.sourceDeckId })),
        )) {
          await trx.insertInto("topdeckDecklistCards").values(batch).execute();
        }
      });
    },
  };
}
