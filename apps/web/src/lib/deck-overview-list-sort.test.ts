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

  it("orders by the row's own price when the list resolves one", () => {
    // "Show my printings" is on: each row prices the printing the viewer owns,
    // which reverses the order the deck's display prices would give.
    const cards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Ashe" }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Bard" }),
    ];
    const rowPrices: Record<string, number | undefined> = { a: 900, b: 100 };
    const ctx: DeckListSortContext = {
      ...contextFrom({ a: { displayPrice: 100 }, b: { displayPrice: 900 } }),
      getRowPrice: (card) => rowPrices[card.cardId],
    };

    expect(names(sortDeckOverviewList(cards, "price", "asc", ctx))).toEqual(["Bard", "Ashe"]);
  });

  it("pins a row the resolver leaves unpriced last, ignoring its display price", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "priced", cardName: "Priced" }),
      stubDeckBuilderCard({ cardId: "blank", cardName: "Blank" }),
    ];
    const ctx: DeckListSortContext = {
      // The blank row has a display price, but the printing it shows has none,
      // so it renders no price and must sort with the other unpriced rows.
      ...contextFrom({ priced: { displayPrice: 900 }, blank: { displayPrice: 100 } }),
      getRowPrice: (card) => (card.cardId === "priced" ? 900 : undefined),
    };

    expect(names(sortDeckOverviewList(cards, "price", "asc", ctx))).toEqual(["Priced", "Blank"]);
    expect(names(sortDeckOverviewList(cards, "price", "desc", ctx))).toEqual(["Priced", "Blank"]);
  });

  it("falls back to the display price when no row resolver is supplied", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "cheap", cardName: "Cheap" }),
      stubDeckBuilderCard({ cardId: "pricey", cardName: "Pricey" }),
    ];
    const ctx = contextFrom({ cheap: { displayPrice: 100 }, pricey: { displayPrice: 900 } });

    expect(ctx.getRowPrice).toBeUndefined();
    expect(names(sortDeckOverviewList(cards, "price", "asc", ctx))).toEqual(["Cheap", "Pricey"]);
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

  it("orders by the row's own rarity when the list resolves one", () => {
    // "Show my printings" is on: the rarity icons come from the printings the
    // viewer owns, which rank the two rows the other way round.
    const cards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Ashe" }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Bard" }),
    ];
    const rowRarities: Record<string, string | undefined> = { a: "rare", b: "common" };
    const ctx: DeckListSortContext = {
      ...contextFrom({
        a: { displayPrinting: { rarity: "common" } as CardOwnership["displayPrinting"] },
        b: { displayPrinting: { rarity: "rare" } as CardOwnership["displayPrinting"] },
      }),
      getRowRarity: (card) => rowRarities[card.cardId],
    };

    expect(names(sortDeckOverviewList(cards, "rarity", "asc", ctx))).toEqual(["Bard", "Ashe"]);
  });

  it("pins a row the rarity resolver leaves blank last, ignoring its display rarity", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "known", cardName: "Known" }),
      stubDeckBuilderCard({ cardId: "blank", cardName: "Blank" }),
    ];
    const ctx: DeckListSortContext = {
      // Blank has a display rarity, but the printing it shows resolves to none,
      // so it renders no icon and sorts with the unknowns.
      ...contextFrom({
        known: { displayPrinting: { rarity: "rare" } as CardOwnership["displayPrinting"] },
        blank: { displayPrinting: { rarity: "common" } as CardOwnership["displayPrinting"] },
      }),
      getRowRarity: (card) => (card.cardId === "known" ? "rare" : undefined),
    };

    expect(names(sortDeckOverviewList(cards, "rarity", "asc", ctx))).toEqual(["Known", "Blank"]);
    expect(names(sortDeckOverviewList(cards, "rarity", "desc", ctx))).toEqual(["Known", "Blank"]);
  });

  it("falls back to the display rarity when no row resolver is supplied", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "r", cardName: "Rare" }),
      stubDeckBuilderCard({ cardId: "c", cardName: "Common" }),
    ];
    const ctx = contextFrom({
      r: { displayPrinting: { rarity: "rare" } as CardOwnership["displayPrinting"] },
      c: { displayPrinting: { rarity: "common" } as CardOwnership["displayPrinting"] },
    });

    expect(ctx.getRowRarity).toBeUndefined();
    expect(names(sortDeckOverviewList(cards, "rarity", "asc", ctx))).toEqual(["Common", "Rare"]);
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
