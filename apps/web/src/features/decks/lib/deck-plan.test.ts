import type { DeckPlanResponse } from "@openrift/shared/types/api/deck";
import { describe, expect, it } from "vitest";

import {
  computePlanWarnings,
  createEmptyMatchup,
  createEmptyPlanDraft,
  isPlanDraftEmpty,
  planDraftToSaveInput,
  planResponseToDraft,
} from "./deck-plan";
import type { DeckPlanContext, PlanDraft } from "./deck-plan";

const OPPONENT = "11111111-1111-1111-1111-111111111111";
const MAIN_CARD = "22222222-2222-2222-2222-222222222222";
const BENCH_CARD = "33333333-3333-3333-3333-333333333333";
const BATTLEFIELD = "44444444-4444-4444-4444-444444444444";

function context(overrides?: Partial<DeckPlanContext>): DeckPlanContext {
  return {
    maindeck: new Map([[MAIN_CARD, 3]]),
    sideboard: new Map([[BENCH_CARD, 2]]),
    battlefieldCardIds: new Set([BATTLEFIELD]),
    ...overrides,
  };
}

function draftWithMatchup(overrides?: Partial<PlanDraft["matchups"][number]>): PlanDraft {
  return {
    ...createEmptyPlanDraft(),
    matchups: [{ ...createEmptyMatchup(), opponentCardId: OPPONENT, ...overrides }],
  };
}

describe("planResponseToDraft", () => {
  it("copies every field and matchup from the response", () => {
    const plan: DeckPlanResponse = {
      generalStrategy: "Race them",
      mulliganSplit: true,
      mulliganGeneral: "",
      mulliganFirst: "Keep removal",
      mulliganSecond: "Keep threats",
      battlefieldGame1CardId: BATTLEFIELD,
      battlefieldFirstCardId: null,
      battlefieldSecondCardId: null,
      battlefieldCustom: false,
      battlefieldNote: "",
      matchups: [
        {
          id: "abc",
          opponentCardId: OPPONENT,
          opponentLabel: "Scorn of the Moon",
          notes: "Watch the bench",
          swaps: [{ cardId: BENCH_CARD, direction: "in", quantity: 1 }],
        },
      ],
    };
    const draft = planResponseToDraft(plan);
    expect(draft.generalStrategy).toBe("Race them");
    expect(draft.mulliganSplit).toBe(true);
    expect(draft.matchups).toHaveLength(1);
    expect(draft.matchups[0]?.opponentCardId).toBe(OPPONENT);
    expect(draft.matchups[0]?.opponentLabel).toBe("Scorn of the Moon");
    expect(draft.matchups[0]?.swaps[0]).toEqual({
      cardId: BENCH_CARD,
      direction: "in",
      quantity: 1,
    });
  });
});

describe("planDraftToSaveInput", () => {
  it("drops matchups with no opponent and trims text", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      generalStrategy: "  win  ",
      matchups: [
        createEmptyMatchup(),
        {
          ...createEmptyMatchup(),
          opponentCardId: OPPONENT,
          opponentLabel: "  build  ",
          notes: " note ",
        },
      ],
    };
    const input = planDraftToSaveInput(draft);
    expect(input.generalStrategy).toBe("win");
    expect(input.matchups).toHaveLength(1);
    expect(input.matchups[0]?.opponentCardId).toBe(OPPONENT);
    expect(input.matchups[0]?.opponentLabel).toBe("build");
    expect(input.matchups[0]?.notes).toBe("note");
  });

  it("keeps a label-only matchup (no linked card)", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      matchups: [{ ...createEmptyMatchup(), opponentCardId: null, opponentLabel: "Aggro" }],
    };
    const input = planDraftToSaveInput(draft);
    expect(input.matchups).toHaveLength(1);
    expect(input.matchups[0]?.opponentCardId).toBeNull();
    expect(input.matchups[0]?.opponentLabel).toBe("Aggro");
  });

  it("keeps a card-only matchup (no label)", () => {
    const draft = draftWithMatchup({ opponentLabel: "" });
    const input = planDraftToSaveInput(draft);
    expect(input.matchups).toHaveLength(1);
    expect(input.matchups[0]?.opponentCardId).toBe(OPPONENT);
    expect(input.matchups[0]?.opponentLabel).toBe("");
  });

  it("drops swaps with no card or non-positive quantity", () => {
    const draft = draftWithMatchup({
      swaps: [
        { cardId: BENCH_CARD, direction: "in", quantity: 2 },
        { cardId: "", direction: "in", quantity: 1 },
        { cardId: MAIN_CARD, direction: "out", quantity: 0 },
      ],
    });
    const input = planDraftToSaveInput(draft);
    expect(input.matchups[0]?.swaps).toEqual([
      { cardId: BENCH_CARD, direction: "in", quantity: 2 },
    ]);
  });
});

describe("computePlanWarnings", () => {
  it("returns no warnings for a balanced, in-deck matchup", () => {
    const draft = draftWithMatchup({
      swaps: [
        { cardId: BENCH_CARD, direction: "in", quantity: 1 },
        { cardId: MAIN_CARD, direction: "out", quantity: 1 },
      ],
    });
    expect(computePlanWarnings(draft, context())).toEqual([]);
  });

  it("flags an unbalanced swap count", () => {
    const draft = draftWithMatchup({
      swaps: [{ cardId: BENCH_CARD, direction: "in", quantity: 1 }],
    });
    const warnings = computePlanWarnings(draft, context());
    expect(warnings).toContainEqual({
      code: "swap-unbalanced",
      matchupIndex: 0,
      inCount: 1,
      outCount: 0,
    });
  });

  it("flags an IN swap that exceeds available sideboard copies", () => {
    const draft = draftWithMatchup({
      swaps: [
        { cardId: BENCH_CARD, direction: "in", quantity: 3 },
        { cardId: MAIN_CARD, direction: "out", quantity: 3 },
      ],
    });
    const warnings = computePlanWarnings(draft, context());
    expect(warnings).toContainEqual({
      code: "in-exceeds-sideboard",
      matchupIndex: 0,
      cardId: BENCH_CARD,
      requested: 3,
      available: 2,
    });
  });

  it("flags an OUT swap that exceeds maindeck copies", () => {
    const draft = draftWithMatchup({
      swaps: [
        { cardId: BENCH_CARD, direction: "in", quantity: 5 },
        { cardId: MAIN_CARD, direction: "out", quantity: 5 },
      ],
    });
    const warnings = computePlanWarnings(draft, context());
    expect(warnings).toContainEqual({
      code: "out-exceeds-maindeck",
      matchupIndex: 0,
      cardId: MAIN_CARD,
      requested: 5,
      available: 3,
    });
  });

  it("flags a matchup with no opponent (neither card nor label)", () => {
    const draft: PlanDraft = { ...createEmptyPlanDraft(), matchups: [createEmptyMatchup()] };
    expect(computePlanWarnings(draft, context())).toContainEqual({
      code: "matchup-no-opponent",
      matchupIndex: 0,
    });
  });

  it("does not flag a label-only matchup", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      matchups: [{ ...createEmptyMatchup(), opponentCardId: null, opponentLabel: "Aggro" }],
    };
    expect(computePlanWarnings(draft, context())).toEqual([]);
  });

  it("flags a battlefield not in the deck", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      battlefieldGame1CardId: "99999999-9999-9999-9999-999999999999",
    };
    expect(computePlanWarnings(draft, context())).toContainEqual({
      code: "battlefield-not-in-deck",
      scenario: "game1",
      cardId: "99999999-9999-9999-9999-999999999999",
    });
  });

  it("does not flag a battlefield the deck runs", () => {
    const draft: PlanDraft = { ...createEmptyPlanDraft(), battlefieldGame1CardId: BATTLEFIELD };
    expect(computePlanWarnings(draft, context())).toEqual([]);
  });

  it("flags a battlefield used in more than one scenario, once", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      battlefieldGame1CardId: BATTLEFIELD,
      battlefieldFirstCardId: BATTLEFIELD,
      battlefieldSecondCardId: BATTLEFIELD,
    };
    const duplicates = computePlanWarnings(draft, context()).filter(
      (warning) => warning.code === "battlefield-duplicate",
    );
    expect(duplicates).toEqual([{ code: "battlefield-duplicate", cardId: BATTLEFIELD }]);
  });

  it("skips battlefield checks in custom mode", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      battlefieldCustom: true,
      battlefieldGame1CardId: "99999999-9999-9999-9999-999999999999",
      battlefieldFirstCardId: "99999999-9999-9999-9999-999999999999",
    };
    const battlefieldWarnings = computePlanWarnings(draft, context()).filter(
      (warning) =>
        warning.code === "battlefield-not-in-deck" || warning.code === "battlefield-duplicate",
    );
    expect(battlefieldWarnings).toEqual([]);
  });
});

describe("isPlanDraftEmpty", () => {
  it("is true for a fresh draft", () => {
    expect(isPlanDraftEmpty(createEmptyPlanDraft())).toBe(true);
  });

  it("is true when the only matchup has no opponent", () => {
    const draft: PlanDraft = { ...createEmptyPlanDraft(), matchups: [createEmptyMatchup()] };
    expect(isPlanDraftEmpty(draft)).toBe(true);
  });

  it("is false once strategy text is present", () => {
    expect(isPlanDraftEmpty({ ...createEmptyPlanDraft(), generalStrategy: "x" })).toBe(false);
  });

  it("is false once a custom battlefield note is present", () => {
    expect(
      isPlanDraftEmpty({
        ...createEmptyPlanDraft(),
        battlefieldCustom: true,
        battlefieldNote: "x",
      }),
    ).toBe(false);
  });

  it("is false once a complete matchup exists", () => {
    expect(isPlanDraftEmpty(draftWithMatchup())).toBe(false);
  });

  it("is false for a label-only matchup", () => {
    const draft: PlanDraft = {
      ...createEmptyPlanDraft(),
      matchups: [{ ...createEmptyMatchup(), opponentCardId: null, opponentLabel: "Aggro" }],
    };
    expect(isPlanDraftEmpty(draft)).toBe(false);
  });
});
