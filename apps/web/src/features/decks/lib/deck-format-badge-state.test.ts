import { describe, expect, it } from "vitest";

import { deckFormatBadgeState } from "./deck-format-badge-state";

const CONSTRUCTED = {
  format: "constructed",
  totalCards: 56,
  requiredProgress: 56,
  requiredTotal: 56,
  isValid: true,
};

describe("deckFormatBadgeState", () => {
  it("reads an empty deck as a draft", () => {
    expect(
      deckFormatBadgeState({
        ...CONSTRUCTED,
        totalCards: 0,
        requiredProgress: 0,
        isValid: false,
      }),
    ).toEqual({ kind: "draft" });
  });

  it("leaves an empty Freeform deck alone, since it breaks no rules", () => {
    expect(
      deckFormatBadgeState({
        format: "freeform",
        totalCards: 0,
        requiredProgress: 0,
        requiredTotal: 56,
        isValid: true,
      }),
    ).toEqual({ kind: "settled" });
  });

  it("carries the figure on an incomplete invalid deck", () => {
    expect(
      deckFormatBadgeState({
        ...CONSTRUCTED,
        totalCards: 48,
        requiredProgress: 48,
        isValid: false,
      }),
    ).toEqual({ kind: "invalid", progress: "48/56" });
  });

  it("drops the figure on a complete but invalid deck", () => {
    expect(deckFormatBadgeState({ ...CONSTRUCTED, isValid: false })).toEqual({
      kind: "invalid",
      progress: undefined,
    });
  });

  it("shows the figure for formats the list never reports invalid", () => {
    expect(
      deckFormatBadgeState({
        format: "freeform",
        totalCards: 41,
        requiredProgress: 41,
        requiredTotal: 56,
        isValid: true,
      }),
    ).toEqual({ kind: "building", progress: "41/56" });

    expect(
      deckFormatBadgeState({
        format: "custom-region",
        totalCards: 50,
        requiredProgress: 50,
        requiredTotal: 54,
        isValid: true,
      }),
    ).toEqual({ kind: "building", progress: "50/54" });
  });

  it("settles once the deck is complete", () => {
    expect(deckFormatBadgeState(CONSTRUCTED)).toEqual({ kind: "settled" });
  });

  it("settles a deck that overshoots its required total", () => {
    expect(deckFormatBadgeState({ ...CONSTRUCTED, totalCards: 60, requiredProgress: 58 })).toEqual({
      kind: "settled",
    });
  });

  it("settles when the format has no required total to measure against", () => {
    expect(
      deckFormatBadgeState({
        ...CONSTRUCTED,
        totalCards: 12,
        requiredProgress: 0,
        requiredTotal: 0,
      }),
    ).toEqual({ kind: "settled" });
  });
});
