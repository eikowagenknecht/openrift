import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckMatchupPlansTable,
  DeckMatchupSwapsTable,
  DeckPlansTable,
} from "../db/index.js";

/** A matchup row plus its in/out swaps, in display order. */
export type MatchupWithSwaps = Selectable<DeckMatchupPlansTable> & {
  swaps: Selectable<DeckMatchupSwapsTable>[];
};

/** The full plan for a deck: the optional deck-level row plus ordered matchups. */
export interface DeckPlanData {
  plan: Selectable<DeckPlansTable> | undefined;
  matchups: MatchupWithSwaps[];
}

/** Input for {@link deckPlansRepo}.`replaceForDeck` — the whole plan, saved as a unit. */
export interface DeckPlanInput {
  generalStrategy: string;
  mulliganSplit: boolean;
  mulliganGeneral: string;
  mulliganFirst: string;
  mulliganSecond: string;
  battlefieldG1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  battlefieldCustom: boolean;
  battlefieldNote: string;
  matchups: {
    opponentLegendCardId: string;
    subtitle: string;
    notes: string;
    swaps: { cardId: string; direction: "in" | "out"; quantity: number }[];
  }[];
}

/**
 * Reads and writes deck plans (ADR-029). Plans hang off the deck and never
 * touch deck_cards.
 *
 * @returns Plan query methods bound to the given `db`.
 */
export function deckPlansRepo(db: Kysely<Database>) {
  return {
    /**
     * @returns The deck-level plan row (or undefined) and the deck's matchups
     * with their swaps, ordered by sort order then creation.
     */
    async getForDeck(deckId: string): Promise<DeckPlanData> {
      const [plan, matchupRows] = await Promise.all([
        db.selectFrom("deckPlans").selectAll().where("deckId", "=", deckId).executeTakeFirst(),
        db
          .selectFrom("deckMatchupPlans")
          .selectAll()
          .where("deckId", "=", deckId)
          .orderBy("sortOrder")
          .orderBy("createdAt")
          .execute(),
      ]);

      const matchupIds = matchupRows.map((row) => row.id);
      const swaps =
        matchupIds.length > 0
          ? await db
              .selectFrom("deckMatchupSwaps")
              .selectAll()
              .where("planId", "in", matchupIds)
              .execute()
          : [];

      const swapsByPlan = Map.groupBy(swaps, (swap) => swap.planId);
      const matchups = matchupRows.map((row) => ({
        ...row,
        swaps: swapsByPlan.get(row.id) ?? [],
      }));

      return { plan, matchups };
    },

    /**
     * Replaces the entire plan for a deck in one transaction: upserts the
     * deck-level row, then deletes and re-inserts all matchups and swaps.
     * Touches the deck's updated_at. Assumes the caller has already verified
     * ownership and validated card references.
     */
    async replaceForDeck(deckId: string, input: DeckPlanInput): Promise<void> {
      await db.transaction().execute(async (trx) => {
        // Upsert (not delete+insert) so the row's id and created_at survive an
        // edit and the BEFORE UPDATE trigger advances updated_at. deck_id is
        // unique, so it's the conflict target.
        const planValues = {
          generalStrategy: input.generalStrategy,
          mulliganSplit: input.mulliganSplit,
          mulliganGeneral: input.mulliganGeneral,
          mulliganFirst: input.mulliganFirst,
          mulliganSecond: input.mulliganSecond,
          battlefieldG1CardId: input.battlefieldG1CardId,
          battlefieldFirstCardId: input.battlefieldFirstCardId,
          battlefieldSecondCardId: input.battlefieldSecondCardId,
          battlefieldCustom: input.battlefieldCustom,
          battlefieldNote: input.battlefieldNote,
        };
        await trx
          .insertInto("deckPlans")
          .values({ deckId, ...planValues })
          .onConflict((oc) => oc.column("deckId").doUpdateSet(planValues))
          .execute();

        // Cascade removes the old swaps with their matchups.
        await trx.deleteFrom("deckMatchupPlans").where("deckId", "=", deckId).execute();

        for (const [index, matchup] of input.matchups.entries()) {
          const inserted = await trx
            .insertInto("deckMatchupPlans")
            .values({
              deckId,
              opponentLegendCardId: matchup.opponentLegendCardId,
              subtitle: matchup.subtitle,
              notes: matchup.notes,
              sortOrder: index,
            })
            .returning("id")
            .executeTakeFirstOrThrow();

          if (matchup.swaps.length > 0) {
            await trx
              .insertInto("deckMatchupSwaps")
              .values(
                matchup.swaps.map((swap) => ({
                  planId: inserted.id,
                  cardId: swap.cardId,
                  direction: swap.direction,
                  quantity: swap.quantity,
                })),
              )
              .execute();
          }
        }

        await trx
          .updateTable("decks")
          .set({ updatedAt: sql`now()` })
          .where("id", "=", deckId)
          .execute();
      });
    },
  };
}
