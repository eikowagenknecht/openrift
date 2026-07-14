import { describe, expect, it } from "vitest";

import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { stubDeckBuilderCard } from "@/test/factories";

import type { DeckListSortContext } from "./deck-overview-list-sort";
import { sortDeckOverviewList } from "./deck-overview-list-sort";

const RARITY_ORDER = ["common", "uncommon", "rare", "epic"];

/**
 * Builds a sort context from a per-card map of the facts each sort reads.
 * @returns A DeckListSortContext resolving entries from the given map.
 */
function contextFrom(entries: Record<string, Partial<CardOwnership>>): DeckListSortContext {
  return {
    getEntry: (card: DeckBuilderCard) =>
      card.cardId in entries ? (entries[card.cardId] as CardOwnership) : undefined,
    rarityOrder: RARITY_ORDER,
  };
}

const EMPTY_CONTEXT: DeckListSortContext = {
  getEntry: () => undefined,
  rarityOrder: RARITY_ORDER,
};

function names(cards: DeckBuilderCard[]): string[] {
  return cards.map((card) => card.cardName);
}

describe("sortDeckOverviewList", () => {
  it("orders by curve for the default sort, ignoring direction", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Zed", energy: 3 }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Ashe", energy: 1 }),
      stubDeckBuilderCard({ cardId: "c", cardName: "Bard", energy: 1, power: 2 }),
    ];
    // energy asc → power asc → name; direction is ignored for "default"
    expect(names(sortDeckOverviewList(cards, "default", "desc", EMPTY_CONTEXT))).toEqual([
      "Ashe",
      "Bard",
      "Zed",
    ]);
  });

  it("orders by name and reverses on desc", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Bard" }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Ashe" }),
    ];
    expect(names(sortDeckOverviewList(cards, "name", "asc", EMPTY_CONTEXT))).toEqual([
      "Ashe",
      "Bard",
    ]);
    expect(names(sortDeckOverviewList(cards, "name", "desc", EMPTY_CONTEXT))).toEqual([
      "Bard",
      "Ashe",
    ]);
  });

  it("orders by price with missing prices pinned last regardless of direction", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "cheap", cardName: "Cheap" }),
      stubDeckBuilderCard({ cardId: "pricey", cardName: "Pricey" }),
      stubDeckBuilderCard({ cardId: "unpriced", cardName: "Unpriced" }),
    ];
    const ctx = contextFrom({
      cheap: { displayPrice: 100 },
      pricey: { displayPrice: 900 },
    });
    expect(names(sortDeckOverviewList(cards, "price", "asc", ctx))).toEqual([
      "Cheap",
      "Pricey",
      "Unpriced",
    ]);
    expect(names(sortDeckOverviewList(cards, "price", "desc", ctx))).toEqual([
      "Pricey",
      "Cheap",
      "Unpriced",
    ]);
  });

  it("orders by rarity rank with unknown rarities last", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "r", cardName: "Rare" }),
      stubDeckBuilderCard({ cardId: "c", cardName: "Common" }),
      stubDeckBuilderCard({ cardId: "u", cardName: "Unknown" }),
    ];
    const ctx = contextFrom({
      r: { displayPrinting: { rarity: "rare" } as CardOwnership["displayPrinting"] },
      c: { displayPrinting: { rarity: "common" } as CardOwnership["displayPrinting"] },
    });
    expect(names(sortDeckOverviewList(cards, "rarity", "asc", ctx))).toEqual([
      "Common",
      "Rare",
      "Unknown",
    ]);
  });

  it("orders by ownership shortfall, ascending owned-first and desc missing-first", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "owned", cardName: "Owned" }),
      stubDeckBuilderCard({ cardId: "missing", cardName: "Missing" }),
    ];
    const ctx = contextFrom({
      owned: { shortfall: 0 },
      missing: { shortfall: 2 },
    });
    expect(names(sortDeckOverviewList(cards, "ownership", "asc", ctx))).toEqual([
      "Owned",
      "Missing",
    ]);
    expect(names(sortDeckOverviewList(cards, "ownership", "desc", ctx))).toEqual([
      "Missing",
      "Owned",
    ]);
  });

  it("does not mutate the input array", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "b", cardName: "Bard" }),
      stubDeckBuilderCard({ cardId: "a", cardName: "Ashe" }),
    ];
    const before = names(cards);
    sortDeckOverviewList(cards, "name", "asc", EMPTY_CONTEXT);
    expect(names(cards)).toEqual(before);
  });
});
