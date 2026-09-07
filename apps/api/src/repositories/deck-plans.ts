import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type {
  Database,
  DeckMatchupPlansTable,
  DeckMatchupSwapsTable,
  DeckPlansTable,
} from "../db/index.js";

type MatchupWithSwaps = Selectable<DeckMatchupPlansTable> & {
  swaps: Selectable<DeckMatchupSwapsTable>[];
};

export interface DeckPlanData {
  plan: Selectable<DeckPlansTable> | undefined;
  matchups: MatchupWithSwaps[];
}

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
    opponentCardId: string | null;
    opponentLabel: string;
    notes: string;
    swaps: { cardId: string; direction: "in" | "out"; quantity: number }[];
  }[];
}

// Plans hang off the deck and never touch deck_cards.
export function deckPlansRepo(db: Kysely<Database>) {
  return {
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

    // Assumes the caller has already verified ownership and validated card references.
    async replaceForDeck(deckId: string, input: DeckPlanInput): Promise<void> {
      await db.transaction().execute(async (trx) => {
        // Upsert (not delete+insert) so id/created_at survive an edit and
        // the BEFORE UPDATE trigger advances updated_at.
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
              opponentCardId: matchup.opponentCardId,
              opponentLabel: matchup.opponentLabel,
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
