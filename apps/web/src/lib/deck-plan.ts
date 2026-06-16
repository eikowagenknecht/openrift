import type { Card, DeckPlanCardMetaResponse, DeckPlanResponse } from "@openrift/shared";

import type { DeckPlanSaveInput } from "@/hooks/use-deck-plan";

// Pure helpers for the deck-plan editor (ADR-029): the editable draft shape,
// conversions to/from the wire types, and the soft validation that warns
// (never blocks) when swaps don't balance or reference cards the deck no
// longer holds. Kept free of React so it's unit-tested in isolation.

export type SwapDirection = "in" | "out";

interface PlanSwapDraft {
  cardId: string;
  direction: SwapDirection;
  quantity: number;
}

// Stable client-side id for a draft matchup, used as the React key so a
// matchup's component instance (and its collapse state) follows it across
// reorders. Never sent to the server.
let matchupUidCounter = 0;
function nextMatchupUid(): string {
  matchupUidCounter += 1;
  return `matchup-${matchupUidCounter}`;
}

export interface PlanMatchupDraft {
  /** Stable client-side id (React key); not persisted. */
  uid: string;
  /** Null while the user is still picking the opponent Legend. */
  opponentLegendCardId: string | null;
  subtitle: string;
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
  /** When true, `battlefieldNote` free text replaces the per-scenario picks. */
  battlefieldCustom: boolean;
  battlefieldNote: string;
  matchups: PlanMatchupDraft[];
}

/** Per-card copy counts in the deck, used to check swaps and battlefields against what the deck holds. */
export interface DeckPlanContext {
  /** cardId → copies in the maindeck (`main` zone): the OUT pool. */
  maindeck: Map<string, number>;
  /** cardId → copies in the `sideboard` zone: the IN pool. */
  sideboard: Map<string, number>;
  /** cardIds in the deck's `battlefield` zone. */
  battlefieldCardIds: Set<string>;
}

export type PlanWarning =
  | { code: "matchup-no-legend"; matchupIndex: number }
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
  return { uid: nextMatchupUid(), opponentLegendCardId: null, subtitle: "", notes: "", swaps: [] };
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

// Seeds the editor draft from a loaded plan.
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
      opponentLegendCardId: matchup.opponentLegendCardId,
      subtitle: matchup.subtitle,
      notes: matchup.notes,
      swaps: matchup.swaps.map((swap) => ({
        cardId: swap.cardId,
        direction: swap.direction,
        quantity: swap.quantity,
      })),
    })),
  };
}

// True once a matchup has an opponent Legend picked; only complete matchups are saved.
export function isMatchupComplete(matchup: PlanMatchupDraft): matchup is PlanMatchupDraft & {
  opponentLegendCardId: string;
} {
  return matchup.opponentLegendCardId !== null;
}

/**
 * Converts the editor draft to the save payload. Drops matchups without a
 * Legend and swaps without a card or non-positive quantity, and trims text, so
 * an in-progress row never reaches the API.
 *
 * @returns The normalized save payload.
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
      opponentLegendCardId: matchup.opponentLegendCardId,
      subtitle: matchup.subtitle.trim(),
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

/**
 * Computes the soft warnings shown in the editor. Advisory only — the plan
 * still saves. Covers: a matchup with no Legend, unbalanced in/out counts,
 * swaps that exceed the deck's available copies, and a chosen battlefield the
 * deck doesn't run.
 *
 * @returns The list of warnings, empty when the plan is clean.
 */
export function computePlanWarnings(draft: PlanDraft, context: DeckPlanContext): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  draft.matchups.forEach((matchup, matchupIndex) => {
    if (!isMatchupComplete(matchup)) {
      warnings.push({ code: "matchup-no-legend", matchupIndex });
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

  // Custom mode hides the per-scenario picks (the free-text note replaces
  // them), so the picks aren't editable and their warnings would be for fields
  // the user can't see. Skip both battlefield checks entirely rather than
  // relying on the editor to suppress the output.
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

    // A battlefield used in more than one scenario is almost always a mistake
    // (you only run one copy). Report each duplicated card once.
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

// True when the draft has no content worth saving (empty deck-level fields and no complete matchups).
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

/**
 * Every card id a plan references: the per-scenario battlefields, plus each
 * matchup's opponent Legend and swapped cards. Deduplicated.
 * @returns The distinct referenced card ids.
 */
export function planReferencedCardIds(plan: DeckPlanResponse): string[] {
  const ids = new Set<string>();
  for (const id of [
    plan.battlefieldGame1CardId,
    plan.battlefieldFirstCardId,
    plan.battlefieldSecondCardId,
  ]) {
    if (id !== null) {
      ids.add(id);
    }
  }
  for (const matchup of plan.matchups) {
    ids.add(matchup.opponentLegendCardId);
    for (const swap of matchup.swaps) {
      ids.add(swap.cardId);
    }
  }
  return [...ids];
}

/**
 * Builds the denormalized card-meta lookup a plan needs to render names and
 * thumbnails. The public share page receives this from the API; the editor has
 * the live catalog, so it builds the same shape locally. Cards missing from the
 * catalog are skipped.
 * @returns Display metadata for every catalog-known card the plan references.
 */
export function buildPlanCardMeta(
  plan: DeckPlanResponse,
  cardsById: Record<string, Card>,
  getImageId: (cardId: string) => string | null,
): DeckPlanCardMetaResponse[] {
  return planReferencedCardIds(plan).flatMap((cardId) => {
    const card = cardsById[cardId];
    if (!card) {
      return [];
    }
    return [
      {
        cardId,
        cardName: card.name,
        cardSlug: card.slug,
        cardType: card.type,
        imageId: getImageId(cardId),
      },
    ];
  });
}

/**
 * A short "Strategy · Mulligan · 3 matchups" summary of what a plan contains,
 * for a collapsed section header.
 * @returns The summary string, or "" when the plan is empty.
 */
export function planSummary(plan: DeckPlanResponse): string {
  const parts: string[] = [];
  if (plan.generalStrategy !== "") {
    parts.push("Strategy");
  }
  const hasMulligan = plan.mulliganSplit
    ? plan.mulliganFirst !== "" || plan.mulliganSecond !== ""
    : plan.mulliganGeneral !== "";
  if (hasMulligan) {
    parts.push("Mulligan");
  }
  const hasBattlefields = plan.battlefieldCustom
    ? plan.battlefieldNote !== ""
    : plan.battlefieldGame1CardId !== null ||
      plan.battlefieldFirstCardId !== null ||
      plan.battlefieldSecondCardId !== null;
  if (hasBattlefields) {
    parts.push("Battlefields");
  }
  if (plan.matchups.length > 0) {
    parts.push(`${plan.matchups.length} matchup${plan.matchups.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
