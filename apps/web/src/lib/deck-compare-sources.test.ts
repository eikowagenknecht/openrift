import type { Card, DeckImportEntry, DeckListItemResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { LocalDeck } from "@/lib/local-deck";
import { stubCard, stubPrinting } from "@/test/factories";

import {
  collectCompareDeckOptions,
  diffCardsFromEntries,
  ownDeckDiffCards,
} from "./deck-compare-sources";

const cardsById: Record<string, Card> = {
  "unit-1": stubCard({ name: "Footsoldier", type: "unit", domains: ["fury"] }),
  "spell-1": stubCard({ name: "Zap", type: "spell", domains: ["mind"] }),
};

function serverDeck(overrides: {
  id: string;
  name: string;
  archivedAt?: string | null;
  totalCards?: number;
}): DeckListItemResponse {
  return {
    deck: {
      id: overrides.id,
      name: overrides.name,
      descriptionSnippet: null,
      format: WellKnown.deckFormat.CONSTRUCTED,
      formatConfig: null,
      isPinned: false,
      archivedAt: overrides.archivedAt ?? null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      collectionId: null,
      familyId: null,
      predecessorDeckId: null,
      isPrimary: false,
      isDraft: false,
    },
    legendCardId: null,
    championCardId: null,
    totalCards: overrides.totalCards ?? 40,
    typeCounts: [],
    domainDistribution: [],
    isValid: true,
    requiredProgress: 40,
    requiredTotal: 40,
    totalValueCents: null,
    missingCount: null,
    folderIds: [],
  };
}

function localDeck(overrides: Partial<LocalDeck> = {}): LocalDeck {
  return {
    id: "local:test",
    name: "Test",
    description: "",
    format: WellKnown.deckFormat.CONSTRUCTED,
    formatConfig: null,
    cards: [],
    coverCardId: null,
    coverPrintingId: null,
    coverPosition: null,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("collectCompareDeckOptions", () => {
  it("merges server and local decks into one alphabetical list", () => {
    const options = collectCompareDeckOptions(
      "open-deck",
      [
        serverDeck({ id: "srv-1", name: "Zed Tempo" }),
        serverDeck({ id: "srv-2", name: "Ahri Mid" }),
      ],
      {
        "local:a": localDeck({ id: "local:a", name: "Malphite Rock" }),
      },
    );

    expect(options.map((option) => option.name)).toEqual([
      "Ahri Mid",
      "Malphite Rock",
      "Zed Tempo",
    ]);
    expect(options.map((option) => option.id)).toEqual(["srv-2", "local:a", "srv-1"]);
  });

  it("excludes the open deck from both stores", () => {
    const options = collectCompareDeckOptions(
      "srv-1",
      [
        serverDeck({ id: "srv-1", name: "Zed Tempo" }),
        serverDeck({ id: "srv-2", name: "Ahri Mid" }),
      ],
      { "local:a": localDeck({ id: "local:a", name: "Malphite Rock" }) },
    );
    expect(options.map((option) => option.id)).toEqual(["srv-2", "local:a"]);

    const localOpen = collectCompareDeckOptions("local:a", [], {
      "local:a": localDeck({ id: "local:a", name: "Malphite Rock" }),
      "local:b": localDeck({ id: "local:b", name: "Jinx Burn" }),
    });
    expect(localOpen.map((option) => option.id)).toEqual(["local:b"]);
  });

  it("excludes archived server decks", () => {
    const options = collectCompareDeckOptions(
      "open-deck",
      [
        serverDeck({ id: "srv-1", name: "Zed Tempo", archivedAt: "2026-02-01T00:00:00.000Z" }),
        serverDeck({ id: "srv-2", name: "Ahri Mid" }),
      ],
      {},
    );
    expect(options.map((option) => option.id)).toEqual(["srv-2"]);
  });

  it("carries the server card count and sums the local one across zones", () => {
    const options = collectCompareDeckOptions(
      "open-deck",
      [serverDeck({ id: "srv-1", name: "Ahri Mid", totalCards: 41 })],
      {
        "local:a": localDeck({
          id: "local:a",
          name: "Zed Tempo",
          cards: [
            { zone: "legend", cardId: "legend-1", quantity: 1, preferredPrintingId: null },
            { zone: "main", cardId: "unit-1", quantity: 3, preferredPrintingId: null },
            { zone: "runes", cardId: "rune-1", quantity: 12, preferredPrintingId: null },
          ],
        }),
      },
    );
    expect(options).toEqual([
      { id: "srv-1", name: "Ahri Mid", cardCount: 41 },
      { id: "local:a", name: "Zed Tempo", cardCount: 16 },
    ]);
  });

  it("handles both stores being empty", () => {
    expect(collectCompareDeckOptions("open-deck", [], {})).toEqual([]);
    expect(collectCompareDeckOptions("open-deck", undefined, {})).toEqual([]);
  });
});

describe("ownDeckDiffCards", () => {
  it("resolves rows to diff cards with their catalog names", () => {
    const { theirs, unmatched } = ownDeckDiffCards(
      [
        { cardId: "unit-1", zone: "main", quantity: 3 },
        { cardId: "spell-1", zone: "sideboard", quantity: 2 },
      ],
      cardsById,
    );

    expect(theirs).toEqual([
      { cardId: "unit-1", cardName: "Footsoldier", zone: "main", quantity: 3 },
      { cardId: "spell-1", cardName: "Zap", zone: "sideboard", quantity: 2 },
    ]);
    expect(unmatched).toEqual([]);
  });

  it("reports rows whose card is no longer in the catalog instead of dropping them", () => {
    const { theirs, unmatched } = ownDeckDiffCards(
      [
        { cardId: "unit-1", zone: "main", quantity: 3 },
        { cardId: "gone-1", zone: "main", quantity: 1 },
      ],
      cardsById,
    );

    expect(theirs.map((card) => card.cardId)).toEqual(["unit-1"]);
    expect(unmatched).toEqual(["gone-1"]);
  });

  it("returns nothing for an empty deck", () => {
    expect(ownDeckDiffCards([], cardsById)).toEqual({ theirs: [], unmatched: [] });
  });
});

describe("diffCardsFromEntries", () => {
  const printings = [
    stubPrinting({ cardId: "unit-1", shortCode: "OGN-001", card: { name: "Footsoldier" } }),
    stubPrinting({ cardId: "spell-1", shortCode: "OGN-002", card: { name: "Zap" } }),
  ];

  function entry(overrides: Partial<DeckImportEntry> & { quantity: number }): DeckImportEntry {
    return { sourceSlot: "mainDeck", rawFields: {}, ...overrides };
  }

  it("resolves entries against the catalog", () => {
    const { cards, unmatched } = diffCardsFromEntries(
      [entry({ shortCode: "OGN-001", quantity: 3 })],
      printings,
    );

    expect(cards).toEqual([
      { cardId: "unit-1", cardName: "Footsoldier", zone: "main", quantity: 3 },
    ]);
    expect(unmatched).toEqual([]);
  });

  it("reports lines that match no card by their own label", () => {
    const { cards, unmatched } = diffCardsFromEntries(
      [
        entry({ cardName: "Nothing At All", quantity: 1 }),
        entry({ shortCode: "OGN-002", quantity: 2 }),
      ],
      printings,
    );

    expect(cards.map((card) => card.cardId)).toEqual(["spell-1"]);
    expect(unmatched).toEqual(["Nothing At All"]);
  });

  it("returns nothing for an empty list", () => {
    expect(diffCardsFromEntries([], printings)).toEqual({ cards: [], unmatched: [] });
  });
});
