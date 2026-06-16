import { describe, expect, it } from "vitest";

import { computeZoneSuggestions } from "./deck-check-advisories.js";
import type { AdvisoryCardLine } from "./deck-check-advisories.js";

/**
 * Builds a matched, persisted card line with sensible defaults.
 * @returns An advisory card line for {@link computeZoneSuggestions}.
 */
function line(overrides: Partial<AdvisoryCardLine> = {}): AdvisoryCardLine {
  return {
    id: "row-1",
    rawName: "Some Card",
    zone: "main",
    quantity: 1,
    resolvedCardId: "card-1",
    matchStatus: "matched",
    ...overrides,
  };
}

const details = new Map([
  ["legend-card", { name: "A Legend", type: "legend", superTypes: [] }],
  ["rune-card", { name: "A Rune", type: "rune", superTypes: [] }],
  ["battlefield-card", { name: "A Battlefield", type: "battlefield", superTypes: [] }],
  ["unit-card", { name: "A Unit", type: "unit", superTypes: [] }],
  ["spell-card", { name: "A Spell", type: "spell", superTypes: [] }],
]);

describe("computeZoneSuggestions", () => {
  it("suggests the type-locked zone for Legend, Rune, and Battlefield cards dumped in main", () => {
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "legend-card" }),
        line({ id: "b", resolvedCardId: "rune-card" }),
        line({ id: "c", resolvedCardId: "battlefield-card" }),
      ],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Legend", currentZone: "main", suggestedZone: "legend" },
      { cardId: "b", cardName: "A Rune", currentZone: "main", suggestedZone: "runes" },
      {
        cardId: "c",
        cardName: "A Battlefield",
        currentZone: "main",
        suggestedZone: "battlefield",
      },
    ]);
  });

  it("catches a type-locked card mis-zoned into any wrong zone, not just main", () => {
    const suggestions = computeZoneSuggestions(
      [line({ id: "a", resolvedCardId: "rune-card", zone: "sideboard" })],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Rune", currentZone: "sideboard", suggestedZone: "runes" },
    ]);
  });

  it("moves a card wrongly parked in a type-locked zone back to main", () => {
    // A type-locked zone accepts only its one type, so a Spell in battlefield is
    // unambiguously misplaced; main is the safe default destination.
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "spell-card", zone: "battlefield" }),
        line({ id: "b", resolvedCardId: "unit-card", zone: "legend" }),
      ],
      details,
    );
    expect(suggestions).toEqual([
      { cardId: "a", cardName: "A Spell", currentZone: "battlefield", suggestedZone: "main" },
      { cardId: "b", cardName: "A Unit", currentZone: "legend", suggestedZone: "main" },
    ]);
  });

  it("never proposes moving an ordinary card among the non-locked zones", () => {
    // None of main / sideboard / champion / overflow is type-locked, so a Unit's
    // placement there is a deckbuilding choice and is left untouched.
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "unit-card", zone: "main" }),
        line({ id: "b", resolvedCardId: "unit-card", zone: "sideboard" }),
        line({ id: "c", resolvedCardId: "unit-card", zone: "champion" }),
        line({ id: "d", resolvedCardId: "unit-card", zone: "overflow" }),
      ],
      details,
    );
    expect(suggestions).toEqual([]);
  });

  it("leaves a type-locked card that is already in the right zone alone", () => {
    const suggestions = computeZoneSuggestions(
      [line({ id: "a", resolvedCardId: "legend-card", zone: "legend" })],
      details,
    );
    expect(suggestions).toEqual([]);
  });

  it("skips unmatched lines, preview lines without an id, and lines with no catalog detail", () => {
    const suggestions = computeZoneSuggestions(
      [
        line({ id: "a", resolvedCardId: "legend-card", matchStatus: "unmatched" }),
        line({ id: undefined, resolvedCardId: "rune-card" }),
        line({ id: "c", resolvedCardId: "missing-card" }),
      ],
      details,
    );
    expect(suggestions).toEqual([]);
  });
});
