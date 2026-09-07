import type { DeckCheckEntryCardResponse } from "@openrift/shared/types/api/deck-check";
import { describe, expect, it } from "vitest";

import { deckCardsFromCheckEntry } from "@/lib/deck-check-save";

function makeEntryCard(
  overrides: Partial<DeckCheckEntryCardResponse> = {},
): DeckCheckEntryCardResponse {
  return {
    id: "line-1",
    sortOrder: 0,
    rawName: "Test Card",
    section: "MainDeck",
    zone: "main",
    quantity: 1,
    matchStatus: "matched",
    foundCopies: [],
    resolvedCardId: "card-1",
    resolvedPrintingId: null,
    ...overrides,
  };
}

describe("deckCardsFromCheckEntry", () => {
  it("returns no cards and no skips for an empty entry", () => {
    expect(deckCardsFromCheckEntry([])).toEqual({ cards: [], skippedCount: 0 });
  });

  it("maps matched lines to deck-card rows with the resolved printing", () => {
    const result = deckCardsFromCheckEntry([
      makeEntryCard({ quantity: 3, resolvedPrintingId: "printing-1" }),
      makeEntryCard({ id: "line-2", zone: "legend", resolvedCardId: "card-2" }),
    ]);
    expect(result.skippedCount).toBe(0);
    expect(result.cards).toEqual([
      { cardId: "card-1", zone: "main", quantity: 3, preferredPrintingId: "printing-1" },
      { cardId: "card-2", zone: "legend", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("merges duplicate lines for the same card, zone, and printing", () => {
    const result = deckCardsFromCheckEntry([
      makeEntryCard({ quantity: 2 }),
      makeEntryCard({ id: "line-2", quantity: 1 }),
    ]);
    expect(result.cards).toEqual([
      { cardId: "card-1", zone: "main", quantity: 3, preferredPrintingId: null },
    ]);
  });

  it("keeps the same card in different zones as separate rows", () => {
    const result = deckCardsFromCheckEntry([
      makeEntryCard({ quantity: 3 }),
      makeEntryCard({ id: "line-2", zone: "sideboard", quantity: 1 }),
    ]);
    expect(result.cards).toHaveLength(2);
  });

  it("skips ambiguous and unmatched lines and counts them", () => {
    const result = deckCardsFromCheckEntry([
      makeEntryCard(),
      makeEntryCard({ id: "line-2", matchStatus: "ambiguous", resolvedCardId: null }),
      makeEntryCard({ id: "line-3", matchStatus: "unmatched", resolvedCardId: null }),
    ]);
    expect(result.skippedCount).toBe(2);
    expect(result.cards).toEqual([
      { cardId: "card-1", zone: "main", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("skips lines whose match status is matched but whose card id is missing", () => {
    const result = deckCardsFromCheckEntry([makeEntryCard({ resolvedCardId: null })]);
    expect(result.skippedCount).toBe(1);
    expect(result.cards).toEqual([]);
  });
});
