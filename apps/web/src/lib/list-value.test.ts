import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  EMPTY_TRADE_PREFERENCE,
  resetIdCounter,
  stubPriceLookup,
  stubPrinting,
} from "@/test/factories";

import { computeListValue } from "./list-value";

beforeEach(() => {
  resetIdCounter();
});

function cardEntry(cardId: string, quantity: number): ListEntryDetailResponse {
  return {
    id: `entry-${cardId}`,
    listId: "list-1",
    kind: "card",
    cardId,
    cardName: "Test",
    cardType: "unit",
    quantity,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

function printingEntry(printing: Printing, quantity: number): ListEntryDetailResponse {
  return {
    id: `entry-${printing.id}`,
    listId: "list-1",
    kind: "printing",
    printingId: printing.id,
    cardName: "Test",
    cardType: "unit",
    quantity,
    setId: printing.setId,
    rarity: printing.rarity,
    finish: printing.finish,
    shortCode: printing.shortCode,
    language: printing.language,
    imageId: null,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

function copyEntry(printing: Printing, quantity: number): ListEntryDetailResponse {
  return {
    id: `copy-${printing.id}`,
    listId: "list-1",
    kind: "copy",
    copyId: `copy-id-${printing.id}`,
    printingId: printing.id,
    cardName: "Test",
    cardType: "unit",
    quantity,
    setId: printing.setId,
    rarity: printing.rarity,
    finish: printing.finish,
    shortCode: printing.shortCode,
    language: printing.language,
    imageId: null,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

describe("computeListValue", () => {
  it("returns zero for an empty list", () => {
    const result = computeListValue({
      entries: [],
      prices: stubPriceLookup({}),
      marketplace: "cardtrader",
      printingsByCardId: new Map(),
    });
    expect(result).toEqual({ value: 0, unpriced: 0 });
  });

  it("sums printing-kind entries by quantity × price", () => {
    const p1 = stubPrinting();
    const p2 = stubPrinting();
    const result = computeListValue({
      entries: [printingEntry(p1, 2), printingEntry(p2, 3)],
      prices: stubPriceLookup({
        [p1.id]: { cardtrader: 1.5 },
        [p2.id]: { cardtrader: 4 },
      }),
      marketplace: "cardtrader",
      printingsByCardId: new Map(),
    });
    expect(result).toEqual({ value: 1.5 * 2 + 4 * 3, unpriced: 0 });
  });

  it("treats printing entries with no marketplace price as unpriced quantity", () => {
    const p1 = stubPrinting();
    const p2 = stubPrinting();
    const result = computeListValue({
      entries: [printingEntry(p1, 2), printingEntry(p2, 5)],
      prices: stubPriceLookup({
        [p1.id]: { cardtrader: 1.5 },
        // p2 has no entry at all
      }),
      marketplace: "cardtrader",
      printingsByCardId: new Map(),
    });
    expect(result).toEqual({ value: 3, unpriced: 5 });
  });

  it("picks the cheapest printing in the supplied map for card-kind entries", () => {
    const cardId = "card-a";
    const cheap = stubPrinting({ cardId });
    const mid = stubPrinting({ cardId });
    const pricey = stubPrinting({ cardId });
    const result = computeListValue({
      entries: [cardEntry(cardId, 4)],
      prices: stubPriceLookup({
        [cheap.id]: { cardtrader: 1.25 },
        [mid.id]: { cardtrader: 3 },
        [pricey.id]: { cardtrader: 7.5 },
      }),
      marketplace: "cardtrader",
      printingsByCardId: new Map([[cardId, [cheap, mid, pricey]]]),
    });
    expect(result).toEqual({ value: 1.25 * 4, unpriced: 0 });
  });

  it("treats a card-kind entry as unpriced when no printing in the map has a price", () => {
    const cardId = "card-a";
    const a = stubPrinting({ cardId });
    const b = stubPrinting({ cardId });
    const result = computeListValue({
      entries: [cardEntry(cardId, 2)],
      prices: stubPriceLookup({}),
      marketplace: "cardtrader",
      printingsByCardId: new Map([[cardId, [a, b]]]),
    });
    expect(result).toEqual({ value: 0, unpriced: 2 });
  });

  it("treats a card-kind entry as unpriced when the card isn't in the map (filtered out by language)", () => {
    const result = computeListValue({
      entries: [cardEntry("missing-card", 3)],
      prices: stubPriceLookup({}),
      marketplace: "cardtrader",
      printingsByCardId: new Map(),
    });
    expect(result).toEqual({ value: 0, unpriced: 3 });
  });

  it("uses the entry printing for copy-kind entries", () => {
    const p1 = stubPrinting();
    const p2 = stubPrinting();
    const result = computeListValue({
      entries: [copyEntry(p1, 1), copyEntry(p2, 1)],
      prices: stubPriceLookup({
        [p1.id]: { cardtrader: 2 },
      }),
      marketplace: "cardtrader",
      printingsByCardId: new Map(),
    });
    expect(result).toEqual({ value: 2, unpriced: 1 });
  });

  it("respects the chosen marketplace when prices differ", () => {
    const p = stubPrinting();
    const lookup = stubPriceLookup({
      [p.id]: { tcgplayer: 5, cardmarket: 4, cardtrader: 3 },
    });
    expect(
      computeListValue({
        entries: [printingEntry(p, 1)],
        prices: lookup,
        marketplace: "tcgplayer",
        printingsByCardId: new Map(),
      }),
    ).toEqual({ value: 5, unpriced: 0 });
    expect(
      computeListValue({
        entries: [printingEntry(p, 1)],
        prices: lookup,
        marketplace: "cardmarket",
        printingsByCardId: new Map(),
      }),
    ).toEqual({ value: 4, unpriced: 0 });
  });

  it("mixes priced and unpriced entries across kinds", () => {
    const cardId = "card-a";
    const cardP = stubPrinting({ cardId });
    const printing = stubPrinting();
    const copy = stubPrinting();
    const result = computeListValue({
      entries: [cardEntry(cardId, 2), printingEntry(printing, 3), copyEntry(copy, 1)],
      prices: stubPriceLookup({
        [cardP.id]: { cardtrader: 0.5 },
        [printing.id]: { cardtrader: 2 },
        // copy unpriced
      }),
      marketplace: "cardtrader",
      printingsByCardId: new Map([[cardId, [cardP]]]),
    });
    expect(result).toEqual({ value: 0.5 * 2 + 2 * 3, unpriced: 1 });
  });
});
