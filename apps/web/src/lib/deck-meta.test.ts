import type { DeckListItemResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { deckMetaParts } from "./deck-meta";

const price = (cents: number) => `€${(cents / 100).toFixed(2)}`;

function stubItem(overrides: Partial<DeckListItemResponse> = {}): DeckListItemResponse {
  return {
    deck: {
      id: "deck-1",
      name: "Piltover Tempo",
      descriptionSnippet: null,
      format: "standard",
      formatConfig: {},
      isPinned: false,
      archivedAt: null,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-09T18:30:00.000Z",
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      ...overrides.deck,
    },
    legendCardId: null,
    championCardId: null,
    totalCards: 60,
    typeCounts: [],
    domainDistribution: [],
    isValid: true,
    requiredProgress: 54,
    requiredTotal: 56,
    totalValueCents: 14_230,
    missingCount: 4,
    ...overrides,
  } as DeckListItemResponse;
}

describe("deckMetaParts", () => {
  it("returns the canonical order regardless of which facts apply", () => {
    const keys = deckMetaParts(stubItem(), price).map((part) => part.key);
    expect(keys).toEqual(["missing", "value", "updated"]);

    const emptyKeys = deckMetaParts(
      stubItem({ totalValueCents: null, missingCount: null }),
      price,
    ).map((part) => part.key);
    expect(emptyKeys).toEqual(["missing", "value", "updated"]);
  });

  it("formats a fully-populated deck", () => {
    const parts = deckMetaParts(stubItem(), price);
    expect(parts.map((part) => part.text)).toEqual(["4 missing", "€142.30", "2026-08-09"]);
    expect(parts[0].warn).toBe(true);
    expect(parts[2].inlineText).toBe("updated 2026-08-09");
  });

  it("keeps the created date as hover context only when it differs", () => {
    expect(deckMetaParts(stubItem(), price)[2].title).toBe("Created 2026-08-01");

    const sameDay = deckMetaParts(
      stubItem({
        deck: { ...stubItem().deck, createdAt: "2026-08-09T09:00:00.000Z" },
      }),
      price,
    );
    expect(sameDay[2].title).toBeUndefined();
  });

  it("blanks the missing part when nothing is missing", () => {
    expect(deckMetaParts(stubItem({ missingCount: 0 }), price)[0].text).toBeNull();
  });

  it("blanks the missing part for local decks with no server inventory", () => {
    expect(deckMetaParts(stubItem({ missingCount: null }), price)[0].text).toBeNull();
  });

  it("blanks the value part when the deck has no priced cards", () => {
    expect(deckMetaParts(stubItem({ totalValueCents: null }), price)[1].text).toBeNull();
    expect(deckMetaParts(stubItem({ totalValueCents: 0 }), price)[1].text).toBeNull();
  });

  it("leaves an empty deck with only its date", () => {
    const parts = deckMetaParts(
      stubItem({ totalCards: 0, totalValueCents: null, missingCount: 0 }),
      price,
    );
    expect(parts.map((part) => part.text)).toEqual([null, null, "2026-08-09"]);
  });
});
