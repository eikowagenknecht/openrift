import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import { describe, expect, it } from "vitest";

import type { DeckMetaPartKey } from "./deck-meta";
import { deckMetaParts } from "./deck-meta";

const price = (cents: number) => `€${(cents / 100).toFixed(2)}`;

function part(parts: ReturnType<typeof deckMetaParts>, key: DeckMetaPartKey) {
  const found = parts.find((candidate) => candidate.key === key);
  if (!found) {
    throw new Error(`No ${key} part`);
  }
  return found;
}

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
      collectionId: null,
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
    const keys = deckMetaParts(stubItem(), price, "Deckbox 1").map((entry) => entry.key);
    expect(keys).toEqual(["box", "missing", "value", "updated"]);

    const emptyKeys = deckMetaParts(
      stubItem({ totalValueCents: null, missingCount: null }),
      price,
    ).map((entry) => entry.key);
    expect(emptyKeys).toEqual(["box", "missing", "value", "updated"]);
  });

  it("formats a fully-populated deck", () => {
    const parts = deckMetaParts(stubItem(), price, "Deckbox 1");
    expect(parts.map((entry) => entry.text)).toEqual([
      "in Deckbox 1",
      "4 missing",
      "€142.30",
      "2026-08-09",
    ]);
    expect(part(parts, "missing").warn).toBe(true);
    expect(part(parts, "updated").inlineText).toBe("updated 2026-08-09");
  });

  it("names the box it is stored in, with the full phrase on hover", () => {
    const parts = deckMetaParts(stubItem(), price, "Deckbox 1");
    expect(part(parts, "box").text).toBe("in Deckbox 1");
    expect(part(parts, "box").title).toBe("Stored in Deckbox 1");
  });

  it("blanks the box part for a deck that lives nowhere", () => {
    expect(part(deckMetaParts(stubItem(), price), "box").text).toBeNull();
    expect(part(deckMetaParts(stubItem(), price, null), "box").text).toBeNull();
  });

  it("keeps the created date as hover context only when it differs", () => {
    expect(part(deckMetaParts(stubItem(), price), "updated").title).toBe("Created 2026-08-01");

    const sameDay = deckMetaParts(
      stubItem({
        deck: { ...stubItem().deck, createdAt: "2026-08-09T09:00:00.000Z" },
      }),
      price,
    );
    expect(part(sameDay, "updated").title).toBeUndefined();
  });

  it("blanks the missing part when nothing is missing", () => {
    expect(part(deckMetaParts(stubItem({ missingCount: 0 }), price), "missing").text).toBeNull();
  });

  it("blanks the missing part for local decks with no server inventory", () => {
    expect(part(deckMetaParts(stubItem({ missingCount: null }), price), "missing").text).toBeNull();
  });

  it("blanks the value part when the deck has no priced cards", () => {
    expect(
      part(deckMetaParts(stubItem({ totalValueCents: null }), price), "value").text,
    ).toBeNull();
    expect(part(deckMetaParts(stubItem({ totalValueCents: 0 }), price), "value").text).toBeNull();
  });

  it("leaves an empty deck with only its date", () => {
    const parts = deckMetaParts(
      stubItem({ totalCards: 0, totalValueCents: null, missingCount: 0 }),
      price,
    );
    expect(parts.map((entry) => entry.text)).toEqual([null, null, null, "2026-08-09"]);
  });
});
