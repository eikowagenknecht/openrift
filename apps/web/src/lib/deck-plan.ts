import type { DeckPlanResponse } from "@openrift/shared";
import type { decksContract } from "@openrift/shared/contracts/decks";

import type { ContractInput } from "@/lib/server-fns/orpc-client";

/** Matchups carry no id; the server assigns them. */
export type DeckPlanSaveInput = Omit<ContractInput<typeof decksContract, "replacePlan">, "id">;

export type SwapDirection = "in" | "out";

export interface PlanSwapDraft {
  cardId: string;
  direction: SwapDirection;
  quantity: number;
}

// React key so a matchup's component instance (and collapse state) follows
// it across reorders. Never sent to the server.
let matchupUidCounter = 0;
function nextMatchupUid(): string {
  matchupUidCounter += 1;
  return `matchup-${matchupUidCounter}`;
}

export interface PlanMatchupDraft {
  uid: string;
  opponentCardId: string | null;
  opponentLabel: string;
  notes: string;
  swaps: PlanSwapDraft[];
}

export interface PlanDraft {
  generalStrategy: string;
  mulliganSplit: boolean;
  mulliganGeneral: string;
  mulliganFirst: string;
  mulliganSecond: string;
  battlefieldGame1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  battlefieldCustom: boolean;
  battlefieldNote: string;
  matchups: PlanMatchupDraft[];
}

export interface DeckPlanContext {
  maindeck: Map<string, number>;
  sideboard: Map<string, number>;
  battlefieldCardIds: Set<string>;
}

export type PlanWarning =
  | { code: "matchup-no-opponent"; matchupIndex: number }
  | { code: "swap-unbalanced"; matchupIndex: number; inCount: number; outCount: number }
  | {
      code: "in-exceeds-sideboard";
      matchupIndex: number;
      cardId: string;
      requested: number;
      available: number;
    }
  | {
      code: "out-exceeds-maindeck";
      matchupIndex: number;
      cardId: string;
      requested: number;
      available: number;
    }
  | { code: "battlefield-not-in-deck"; scenario: "game1" | "first" | "second"; cardId: string }
  | { code: "battlefield-duplicate"; cardId: string };

export function createEmptyMatchup(): PlanMatchupDraft {
  return { uid: nextMatchupUid(), opponentCardId: null, opponentLabel: "", notes: "", swaps: [] };
}

export function createEmptyPlanDraft(): PlanDraft {
  return {
    generalStrategy: "",
    mulliganSplit: false,
    mulliganGeneral: "",
    mulliganFirst: "",
    mulliganSecond: "",
    battlefieldGame1CardId: null,
    battlefieldFirstCardId: null,
    battlefieldSecondCardId: null,
    battlefieldCustom: false,
    battlefieldNote: "",
    matchups: [],
  };
}

export function planResponseToDraft(plan: DeckPlanResponse): PlanDraft {
  return {
    generalStrategy: plan.generalStrategy,
    mulliganSplit: plan.mulliganSplit,
    mulliganGeneral: plan.mulliganGeneral,
    mulliganFirst: plan.mulliganFirst,
    mulliganSecond: plan.mulliganSecond,
    battlefieldGame1CardId: plan.battlefieldGame1CardId,
    battlefieldFirstCardId: plan.battlefieldFirstCardId,
    battlefieldSecondCardId: plan.battlefieldSecondCardId,
    battlefieldCustom: plan.battlefieldCustom,
    battlefieldNote: plan.battlefieldNote,
    matchups: plan.matchups.map((matchup) => ({
      uid: nextMatchupUid(),
      opponentCardId: matchup.opponentCardId,
      opponentLabel: matchup.opponentLabel,
      notes: matchup.notes,
      swaps: matchup.swaps.map((swap) => ({
        cardId: swap.cardId,
        direction: swap.direction,
        quantity: swap.quantity,
      })),
    })),
  };
}

export function isMatchupComplete(matchup: PlanMatchupDraft): boolean {
  return matchup.opponentCardId !== null || matchup.opponentLabel.trim() !== "";
}

/**
 * Drops matchups with no opponent and swaps without a card or non-positive
 * quantity, so an in-progress row never reaches the API.
 */
export function planDraftToSaveInput(draft: PlanDraft): DeckPlanSaveInput {
  return {
    generalStrategy: draft.generalStrategy.trim(),
    mulliganSplit: draft.mulliganSplit,
    mulliganGeneral: draft.mulliganGeneral.trim(),
    mulliganFirst: draft.mulliganFirst.trim(),
    mulliganSecond: draft.mulliganSecond.trim(),
    battlefieldGame1CardId: draft.battlefieldGame1CardId,
    battlefieldFirstCardId: draft.battlefieldFirstCardId,
    battlefieldSecondCardId: draft.battlefieldSecondCardId,
    battlefieldCustom: draft.battlefieldCustom,
    battlefieldNote: draft.battlefieldNote.trim(),
    matchups: draft.matchups.filter(isMatchupComplete).map((matchup) => ({
      opponentCardId: matchup.opponentCardId,
      opponentLabel: matchup.opponentLabel.trim(),
      notes: matchup.notes.trim(),
      swaps: matchup.swaps
        .filter((swap) => swap.cardId !== "" && swap.quantity > 0)
        .map((swap) => ({
          cardId: swap.cardId,
          direction: swap.direction,
          quantity: swap.quantity,
        })),
    })),
  };
}

function countSwaps(matchup: PlanMatchupDraft, direction: SwapDirection): number {
  return matchup.swaps
    .filter((swap) => swap.direction === direction)
    .reduce((total, swap) => total + swap.quantity, 0);
}

/** Advisory only: warnings never block a save. */
export function computePlanWarnings(draft: PlanDraft, context: DeckPlanContext): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  draft.matchups.forEach((matchup, matchupIndex) => {
    if (!isMatchupComplete(matchup)) {
      warnings.push({ code: "matchup-no-opponent", matchupIndex });
    }

    const inCount = countSwaps(matchup, "in");
    const outCount = countSwaps(matchup, "out");
    if (inCount !== outCount) {
      warnings.push({ code: "swap-unbalanced", matchupIndex, inCount, outCount });
    }

    for (const swap of matchup.swaps) {
      if (swap.cardId === "" || swap.quantity <= 0) {
        continue;
      }
      if (swap.direction === "in") {
        const available = context.sideboard.get(swap.cardId) ?? 0;
        if (swap.quantity > available) {
          warnings.push({
            code: "in-exceeds-sideboard",
            matchupIndex,
            cardId: swap.cardId,
            requested: swap.quantity,
            available,
          });
        }
      } else {
        const available = context.maindeck.get(swap.cardId) ?? 0;
        if (swap.quantity > available) {
          warnings.push({
            code: "out-exceeds-maindeck",
            matchupIndex,
            cardId: swap.cardId,
            requested: swap.quantity,
            available,
          });
        }
      }
    }
  });

  // Custom mode hides the per-scenario picks, so their warnings would be for
  // fields the user can't see.
  if (!draft.battlefieldCustom) {
    const scenarios = [
      { scenario: "game1" as const, cardId: draft.battlefieldGame1CardId },
      { scenario: "first" as const, cardId: draft.battlefieldFirstCardId },
      { scenario: "second" as const, cardId: draft.battlefieldSecondCardId },
    ];
    for (const { scenario, cardId } of scenarios) {
      if (cardId !== null && !context.battlefieldCardIds.has(cardId)) {
        warnings.push({ code: "battlefield-not-in-deck", scenario, cardId });
      }
    }

    const seenBattlefields = new Set<string>();
    const reportedDuplicates = new Set<string>();
    for (const { cardId } of scenarios) {
      if (cardId === null) {
        continue;
      }
      if (seenBattlefields.has(cardId) && !reportedDuplicates.has(cardId)) {
        warnings.push({ code: "battlefield-duplicate", cardId });
        reportedDuplicates.add(cardId);
      }
      seenBattlefields.add(cardId);
    }
  }

  return warnings;
}

export function isPlanDraftEmpty(draft: PlanDraft): boolean {
  return (
    draft.generalStrategy.trim() === "" &&
    draft.mulliganGeneral.trim() === "" &&
    draft.mulliganFirst.trim() === "" &&
    draft.mulliganSecond.trim() === "" &&
    draft.battlefieldGame1CardId === null &&
    draft.battlefieldFirstCardId === null &&
    draft.battlefieldSecondCardId === null &&
    draft.battlefieldNote.trim() === "" &&
    draft.matchups.filter(isMatchupComplete).length === 0
  );
}
