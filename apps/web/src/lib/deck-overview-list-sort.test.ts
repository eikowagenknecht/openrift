import { describe, expect, it } from "vitest";

import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { stubDeckBuilderCard } from "@/test/factories";

import type { DeckListSortContext } from "./deck-overview-list-sort";
import { sortDeckOverviewList } from "./deck-overview-list-sort";

const RARITY_ORDER = ["common", "uncommon", "rare", "epic"];

const SET_INDEXES = new Map([
  ["set-origins", 0],
  ["set-promo", 1],
]);

function contextFrom(entries: Record<string, Partial<CardOwnership>>): DeckListSortContext {
  return {
    getEntry: (card: DeckBuilderCard) =>
      card.cardId in entries ? (entries[card.cardId] as CardOwnership) : undefined,
    rarityOrder: RARITY_ORDER,
    setIndexById: SET_INDEXES,
  };
}

const EMPTY_CONTEXT: DeckListSortContext = {
  getEntry: () => undefined,
  rarityOrder: RARITY_ORDER,
  setIndexById: SET_INDEXES,
};

function withPrinting(setId: string, shortCode: string): Partial<CardOwnership> {
  return { displayPrinting: { setId, shortCode } as CardOwnership["displayPrinting"] };
}

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

  it("orders by card number within a set, with printingless rows pinned last", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "second", cardName: "Second" }),
      stubDeckBuilderCard({ cardId: "first", cardName: "First" }),
      stubDeckBuilderCard({ cardId: "none", cardName: "Unresolved" }),
    ];
    const ctx = contextFrom({
      first: withPrinting("set-origins", "OGN-001"),
      second: withPrinting("set-origins", "OGN-030a"),
    });
    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual([
      "First",
      "Second",
      "Unresolved",
    ]);
    expect(names(sortDeckOverviewList(cards, "id", "desc", ctx))).toEqual([
      "Second",
      "First",
      "Unresolved",
    ]);
  });

  it("orders by set before card number, in the app's set order", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "promo", cardName: "Promo" }),
      stubDeckBuilderCard({ cardId: "origins", cardName: "Origins" }),
    ];
    const ctx = contextFrom({
      promo: withPrinting("set-promo", "AAA-001"),
      origins: withPrinting("set-origins", "OGN-999"),
    });
    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual(["Origins", "Promo"]);
    expect(names(sortDeckOverviewList(cards, "id", "desc", ctx))).toEqual(["Promo", "Origins"]);
  });

  it("sorts a row from an unknown set after every known set", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "stray", cardName: "Stray" }),
      stubDeckBuilderCard({ cardId: "promo", cardName: "Promo" }),
    ];
    const ctx = contextFrom({
      stray: withPrinting("set-nope", "AAA-001"),
      promo: withPrinting("set-promo", "PRM-500"),
    });
    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual(["Promo", "Stray"]);
  });

  it("orders by the row's own printing when the list resolves one", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Ashe" }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Bard" }),
    ];
    const rowPrintings: Record<string, { setId: string; shortCode: string } | undefined> = {
      a: { setId: "set-origins", shortCode: "OGN-050" },
      b: { setId: "set-origins", shortCode: "OGN-010" },
    };
    const ctx: DeckListSortContext = {
      ...contextFrom({
        a: withPrinting("set-origins", "OGN-010"),
        b: withPrinting("set-origins", "OGN-050"),
      }),
      getRowPrinting: (card) => rowPrintings[card.cardId],
    };

    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual(["Bard", "Ashe"]);
  });

  it("falls back to the display printing when no row resolver is supplied", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "b", cardName: "Later" }),
      stubDeckBuilderCard({ cardId: "a", cardName: "Earlier" }),
    ];
    const ctx = contextFrom({
      a: withPrinting("set-origins", "OGN-001"),
      b: withPrinting("set-origins", "OGN-002"),
    });

    expect(ctx.getRowPrinting).toBeUndefined();
    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual(["Earlier", "Later"]);
  });

  it("breaks card-ID ties by name", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "b", cardName: "Bard" }),
      stubDeckBuilderCard({ cardId: "a", cardName: "Ashe" }),
    ];
    const ctx = contextFrom({
      a: withPrinting("set-origins", "OGN-001"),
      b: withPrinting("set-origins", "OGN-001"),
    });
    expect(names(sortDeckOverviewList(cards, "id", "asc", ctx))).toEqual(["Ashe", "Bard"]);
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
