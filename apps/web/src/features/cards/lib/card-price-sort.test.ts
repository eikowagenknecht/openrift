import type { Printing } from "@openrift/shared/types/catalog";
import { beforeEach, describe, expect, it } from "vitest";

import type { PriceRange } from "@/features/cards/lib/card-price-sort";
import { buildSortCardsOptions, computePriceRanges } from "@/features/cards/lib/card-price-sort";
import { resetIdCounter, stubPriceLookup, stubPrinting } from "@/test/factories";

beforeEach(() => {
  resetIdCounter();
});

/** Groups the way the hooks do, via `Map.groupBy(cards, (p) => p.cardId)`. */
function groupByCardId(printings: Printing[]): Map<string, Printing[]> {
  return Map.groupBy(printings, (printing) => printing.cardId);
}

describe("computePriceRanges", () => {
  it("spans the cheapest and dearest priced printing of each card", () => {
    const cheap = stubPrinting({ id: "p1", cardId: "c1" });
    const dear = stubPrinting({ id: "p2", cardId: "c1" });
    const other = stubPrinting({ id: "p3", cardId: "c2" });
    const prices = stubPriceLookup({
      p1: { tcgplayer: 2 },
      p2: { tcgplayer: 11.5 },
      p3: { tcgplayer: 4 },
    });

    const ranges = computePriceRanges(groupByCardId([cheap, dear, other]), prices, "tcgplayer");

    expect(ranges.get("c1")).toEqual({ min: 2, max: 11.5 });
    expect(ranges.get("c2")).toEqual({ min: 4, max: 4 });
  });

  it("returns an empty map for no printings", () => {
    expect(computePriceRanges(new Map(), stubPriceLookup({}), "tcgplayer").size).toBe(0);
  });

  it("omits a card whose printings are all unpriced", () => {
    const printing = stubPrinting({ id: "p1", cardId: "c1" });

    const ranges = computePriceRanges(groupByCardId([printing]), stubPriceLookup({}), "tcgplayer");

    expect(ranges.has("c1")).toBe(false);
  });

  it("ignores unpriced printings of a card that has a priced one", () => {
    const priced = stubPrinting({ id: "p1", cardId: "c1" });
    const unpriced = stubPrinting({ id: "p2", cardId: "c1" });

    const ranges = computePriceRanges(
      groupByCardId([priced, unpriced]),
      stubPriceLookup({ p1: { tcgplayer: 7 } }),
      "tcgplayer",
    );

    expect(ranges.get("c1")).toEqual({ min: 7, max: 7 });
  });

  it("reads the requested marketplace, not whichever price exists", () => {
    const printing = stubPrinting({ id: "p1", cardId: "c1" });
    const prices = stubPriceLookup({ p1: { tcgplayer: 3, cardmarket: 9 } });

    expect(computePriceRanges(groupByCardId([printing]), prices, "cardmarket").get("c1")).toEqual({
      min: 9,
      max: 9,
    });
  });

  it("keeps a zero price rather than treating it as absent", () => {
    const free = stubPrinting({ id: "p1", cardId: "c1" });
    const paid = stubPrinting({ id: "p2", cardId: "c1" });
    const prices = stubPriceLookup({ p1: { tcgplayer: 0 }, p2: { tcgplayer: 5 } });

    expect(computePriceRanges(groupByCardId([free, paid]), prices, "tcgplayer").get("c1")).toEqual({
      min: 0,
      max: 5,
    });
  });
});

describe("buildSortCardsOptions", () => {
  const sets = [{ id: "s1" }];
  const rarityOrder = ["common", "rare"];
  const getPrice = (printing: Printing) => (printing.id === "priced" ? 42 : undefined);
  const ranges = new Map<string, PriceRange>([["c1", { min: 2, max: 11 }]]);

  const build = (overrides: Partial<Parameters<typeof buildSortCardsOptions>[0]> = {}) =>
    buildSortCardsOptions({
      sortBy: "price",
      sortDir: "asc",
      sets,
      getPrice,
      rarityOrder,
      priceRangeByCardId: ranges,
      ...overrides,
    });

  it("always carries direction and sets through", () => {
    const options = build({ sortBy: "name", sortDir: "desc" });

    expect(options.sortDir).toBe("desc");
    expect(options.sets).toBe(sets);
  });

  it("sorts a card tile on the cheap end when ascending", () => {
    const options = build({ sortDir: "asc" });

    expect(options.getPrice?.(stubPrinting({ cardId: "c1" }))).toBe(2);
  });

  it("sorts a card tile on the dear end when descending", () => {
    const options = build({ sortDir: "desc" });

    expect(options.getPrice?.(stubPrinting({ cardId: "c1" }))).toBe(11);
  });

  it("falls back to the printing's own price when its card has no range", () => {
    const options = build();

    expect(options.getPrice?.(stubPrinting({ id: "priced", cardId: "unranged" }))).toBe(42);
  });

  it("reports null, not undefined, for an unpriced printing outside the ranges", () => {
    const options = build();

    expect(options.getPrice?.(stubPrinting({ id: "unpriced", cardId: "unranged" }))).toBeNull();
  });

  it("uses the raw lookup when there are no ranges (printings view)", () => {
    const options = build({ priceRangeByCardId: null });

    expect(options.getPrice).toBe(getPrice);
  });

  it("passes the rarity order for a rarity sort and no price resolver", () => {
    const options = build({ sortBy: "rarity" });

    expect(options.rarityOrder).toBe(rarityOrder);
    expect(options.getPrice).toBeUndefined();
  });

  it("sets neither price resolver nor rarity order for other sorts", () => {
    const options = build({ sortBy: "name" });

    expect(options.getPrice).toBeUndefined();
    expect(options.rarityOrder).toBeUndefined();
  });

  it("ignores the ranges entirely when not sorting by price", () => {
    const options = build({ sortBy: "energy", priceRangeByCardId: ranges });

    expect(options.getPrice).toBeUndefined();
  });
});
