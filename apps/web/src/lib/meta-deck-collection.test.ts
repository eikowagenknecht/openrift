import { priceLookupFromMap } from "@openrift/shared/price-lookup";
import { describe, expect, it } from "vitest";

import {
  cheapestPriceByCardId,
  decodeMetaDeckCardIndex,
  metaDeckCosts,
  ownedCountsByCardId,
} from "./meta-deck-collection";

describe("decodeMetaDeckCardIndex", () => {
  it("turns pooled positions back into card ids", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a", "card-b"],
      decks: [
        { deckId: "deck-1", entries: [0, 3, 1, 1], sideboard: [] },
        { deckId: "deck-2", entries: [1, 2], sideboard: [] },
      ],
    });
    expect([...(decoded.get("deck-1")?.main ?? [])]).toEqual([
      ["card-a", 3],
      ["card-b", 1],
    ]);
    expect([...(decoded.get("deck-2")?.main ?? [])]).toEqual([["card-b", 2]]);
  });

  it("keeps the sideboard apart from the rest of the list", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a", "card-b"],
      decks: [{ deckId: "deck-1", entries: [0, 3], sideboard: [0, 1, 1, 2] }],
    });
    expect([...(decoded.get("deck-1")?.main ?? [])]).toEqual([["card-a", 3]]);
    expect([...(decoded.get("deck-1")?.side ?? [])]).toEqual([
      ["card-a", 1],
      ["card-b", 2],
    ]);
  });

  it("drops a pair naming a card outside the pool", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a"],
      decks: [{ deckId: "deck-1", entries: [0, 2, 7, 1], sideboard: [] }],
    });
    expect([...(decoded.get("deck-1")?.main ?? [])]).toEqual([["card-a", 2]]);
  });

  it("drops a trailing index with no quantity behind it", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: ["card-a", "card-b"],
      decks: [{ deckId: "deck-1", entries: [0, 2, 1], sideboard: [] }],
    });
    expect([...(decoded.get("deck-1")?.main ?? [])]).toEqual([["card-a", 2]]);
  });

  it("keeps a deck the archive holds no cards of", () => {
    const decoded = decodeMetaDeckCardIndex({
      cards: [],
      decks: [{ deckId: "deck-1", entries: [], sideboard: [] }],
    });
    expect(decoded.get("deck-1")?.main.size).toBe(0);
    expect(decoded.get("deck-1")?.side.size).toBe(0);
  });

  it("returns an empty map for an empty index", () => {
    expect(decodeMetaDeckCardIndex({ cards: [], decks: [] }).size).toBe(0);
  });
});

describe("ownedCountsByCardId", () => {
  const printings = new Map([
    ["card-a", [{ id: "print-a1" }, { id: "print-a2" }]],
    ["card-b", [{ id: "print-b1" }]],
  ]);

  it("sums a card's copies across its printings", () => {
    const owned = ownedCountsByCardId({ "print-a1": 2, "print-a2": 1 }, printings);
    expect(owned.get("card-a")).toBe(3);
  });

  it("leaves out a card the reader owns none of", () => {
    const owned = ownedCountsByCardId({ "print-a1": 1 }, printings);
    expect(owned.has("card-b")).toBe(false);
  });

  it("ignores a printing outside the catalog", () => {
    const owned = ownedCountsByCardId({ "print-unknown": 5 }, printings);
    expect(owned.size).toBe(0);
  });
});

describe("cheapestPriceByCardId", () => {
  const printings = new Map([
    [
      "card-a",
      [
        { id: "print-en", language: "en" },
        { id: "print-en-alt", language: "en" },
        { id: "print-de", language: "de" },
      ],
    ],
    ["card-b", [{ id: "print-b-fr", language: "fr" }]],
    ["card-c", [{ id: "print-c", language: "en" }]],
  ]);

  it("takes the cheapest printing in the reader's languages", () => {
    const prices = priceLookupFromMap({
      "print-en": { cardtrader: 500 },
      "print-en-alt": { cardtrader: 250 },
      "print-de": { cardtrader: 100 },
    });
    expect(cheapestPriceByCardId(printings, prices, "cardtrader", ["en"]).get("card-a")).toBe(2.5);
  });

  it("falls back to any language for a card none of them is priced in", () => {
    const prices = priceLookupFromMap({ "print-b-fr": { cardtrader: 400 } });
    expect(cheapestPriceByCardId(printings, prices, "cardtrader", ["en"]).get("card-b")).toBe(4);
  });

  it("prefers a language printing over a cheaper one outside them", () => {
    const prices = priceLookupFromMap({
      "print-en": { cardtrader: 500 },
      "print-de": { cardtrader: 100 },
    });
    expect(cheapestPriceByCardId(printings, prices, "cardtrader", ["en"]).get("card-a")).toBe(5);
  });

  it("leaves out a card no printing of is priced", () => {
    const prices = priceLookupFromMap({ "print-en": { cardtrader: 500 } });
    expect(cheapestPriceByCardId(printings, prices, "cardtrader", ["en"]).has("card-c")).toBe(
      false,
    );
  });

  it("reads the marketplace it was asked for", () => {
    const prices = priceLookupFromMap({ "print-c": { cardtrader: 500, cardmarket: 300 } });
    expect(cheapestPriceByCardId(printings, prices, "cardmarket", ["en"]).get("card-c")).toBe(3);
  });
});

describe("metaDeckCosts", () => {
  const decks = new Map([
    [
      "deck-1",
      {
        main: new Map([
          ["card-a", 3],
          ["card-b", 1],
        ]),
        side: new Map([["card-a", 2]]),
      },
    ],
  ]);
  const prices = new Map([
    ["card-a", 2],
    ["card-b", 10],
  ]);

  it("prices the main deck alone by default", () => {
    const costs = metaDeckCosts(decks, { includeSideboard: false, prices });
    expect(costs.get("deck-1")).toEqual({
      needed: 4,
      owned: undefined,
      value: 16,
      toComplete: undefined,
    });
  });

  it("adds the sideboard's copies to the same card", () => {
    const costs = metaDeckCosts(decks, { includeSideboard: true, prices });
    expect(costs.get("deck-1")?.needed).toBe(6);
    expect(costs.get("deck-1")?.value).toBe(20);
  });

  it("prices only the copies the reader lacks", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: false,
      prices,
      ownedByCardId: new Map([["card-a", 2]]),
    });
    expect(costs.get("deck-1")).toEqual({ needed: 4, owned: 2, value: 16, toComplete: 12 });
  });

  it("caps a card's owned copies at what the list plays", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: false,
      prices,
      ownedByCardId: new Map([["card-a", 9]]),
    });
    expect(costs.get("deck-1")?.owned).toBe(3);
    expect(costs.get("deck-1")?.toComplete).toBe(10);
  });

  it("caps against the combined quantity once the sideboard counts", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: true,
      prices,
      ownedByCardId: new Map([["card-a", 9]]),
    });
    expect(costs.get("deck-1")?.owned).toBe(5);
  });

  it("has no value when one of the list's cards is unpriced", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: false,
      prices: new Map([["card-a", 2]]),
      ownedByCardId: new Map(),
    });
    expect(costs.get("deck-1")?.value).toBeUndefined();
    expect(costs.get("deck-1")?.toComplete).toBeUndefined();
  });

  it("still costs a completion when the unpriced card is one the reader owns", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: false,
      prices: new Map([["card-a", 2]]),
      ownedByCardId: new Map([["card-b", 1]]),
    });
    expect(costs.get("deck-1")?.value).toBeUndefined();
    expect(costs.get("deck-1")?.toComplete).toBe(6);
  });

  it("costs nothing to complete a list the reader already holds", () => {
    const costs = metaDeckCosts(decks, {
      includeSideboard: false,
      prices,
      ownedByCardId: new Map([
        ["card-a", 3],
        ["card-b", 1],
      ]),
    });
    expect(costs.get("deck-1")?.toComplete).toBe(0);
  });

  it("reports a list the archive holds no cards of as needing nothing", () => {
    const costs = metaDeckCosts(new Map([["deck-1", { main: new Map(), side: new Map() }]]), {
      includeSideboard: true,
      prices,
      ownedByCardId: new Map(),
    });
    expect(costs.get("deck-1")).toEqual({ needed: 0, owned: 0, value: 0, toComplete: 0 });
  });
});
