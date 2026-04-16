// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { describe, expect, it, beforeEach } from "vitest";

import {
  resetIdCounter,
  stubDeckBuilderCard,
  stubPriceLookup,
  stubPrinting,
} from "@/test/factories";

import { computeDeckOwnership } from "./use-deck-ownership";

beforeEach(() => {
  resetIdCounter();
});

describe("computeDeckOwnership", () => {
  it("returns all zeros for an empty deck", () => {
    const result = computeDeckOwnership([], [], {}, "tcgplayer", EMPTY_PRICE_LOOKUP);

    expect(result.totalNeeded).toBe(0);
    expect(result.totalOwned).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.missingCards).toHaveLength(0);
  });

  it("marks a fully owned card correctly", () => {
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 3, zone: "main" })];
    const printings = [stubPrinting({ id: printingId, cardId })];
    const owned = { [printingId]: 3 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      owned,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
    );

    expect(result.totalNeeded).toBe(3);
    expect(result.totalOwned).toBe(3);
    expect(result.missingCount).toBe(0);
    expect(result.missingCards).toHaveLength(0);

    const entry = result.byCardZone.get(`${cardId}:main`);
    expect(entry).toBeDefined();
    expect(entry?.shortfall).toBe(0);
  });

  it("marks a partially owned card with correct shortfall", () => {
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 3, zone: "main" })];
    const printings = [stubPrinting({ id: printingId, cardId })];
    const owned = { [printingId]: 1 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      owned,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
    );

    expect(result.totalOwned).toBe(1);
    expect(result.missingCount).toBe(2);
    expect(result.missingCards).toHaveLength(1);
    expect(result.missingCards[0].shortfall).toBe(2);
  });

  it("marks an unowned card as fully missing", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" })];
    const printings = [stubPrinting({ cardId })];

    const result = computeDeckOwnership(deckCards, printings, {}, "tcgplayer", EMPTY_PRICE_LOOKUP);

    expect(result.totalOwned).toBe(0);
    expect(result.missingCount).toBe(2);

    const entry = result.byCardZone.get(`${cardId}:main`);
    expect(entry?.owned).toBe(0);
    expect(entry?.shortfall).toBe(2);
  });

  it("aggregates ownership across multiple printings of the same card", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 3, zone: "main" })];
    const printings = [stubPrinting({ id: "p1", cardId }), stubPrinting({ id: "p2", cardId })];
    const owned = { p1: 1, p2: 2 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      owned,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
    );

    expect(result.totalOwned).toBe(3);
    expect(result.missingCount).toBe(0);
  });

  it("distributes owned copies across zones without double-counting", () => {
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [
      stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" }),
      stubDeckBuilderCard({ cardId, quantity: 2, zone: "sideboard" }),
    ];
    const printings = [stubPrinting({ id: printingId, cardId })];
    // Only own 3 copies, but need 4 (2 main + 2 sideboard)
    const owned = { [printingId]: 3 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      owned,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
    );

    expect(result.totalNeeded).toBe(4);
    expect(result.totalOwned).toBe(3);
    expect(result.missingCount).toBe(1);
  });

  it("computes deck value from cheapest printing price", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" })];
    const printings = [stubPrinting({ id: "p1", cardId }), stubPrinting({ id: "p2", cardId })];
    const owned = { p1: 1 };
    const prices = stubPriceLookup({
      p1: { tcgplayer: 5 },
      p2: { tcgplayer: 3 },
    });

    const result = computeDeckOwnership(deckCards, printings, owned, "tcgplayer", prices);

    // Cheapest printing is $3.00, need 2 copies
    expect(result.deckValueCents).toBe(6);
    // Own 1 copy at cheapest price
    expect(result.ownedValueCents).toBe(3);
    // Missing 1 copy at cheapest price
    expect(result.missingValueCents).toBe(3);
  });

  it("returns undefined values when no price data is available", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 1, zone: "main" })];
    const printings = [stubPrinting({ id: "p1", cardId })];

    const result = computeDeckOwnership(deckCards, printings, {}, "tcgplayer", EMPTY_PRICE_LOOKUP);

    expect(result.deckValueCents).toBeUndefined();
    expect(result.ownedValueCents).toBeUndefined();
    expect(result.missingValueCents).toBeUndefined();
  });

  it("uses marketplace-specific prices when available", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 1, zone: "main" })];
    const printings = [stubPrinting({ id: "p1", cardId })];
    const prices = stubPriceLookup({
      p1: { tcgplayer: 10, cardmarket: 8 },
    });

    const result = computeDeckOwnership(deckCards, printings, {}, "cardmarket", prices);

    expect(result.deckValueCents).toBe(8);
  });

  it("handles multiple cards with mixed ownership", () => {
    const deckCards = [
      stubDeckBuilderCard({ cardId: "a", cardName: "Alpha", quantity: 3, zone: "main" }),
      stubDeckBuilderCard({ cardId: "b", cardName: "Beta", quantity: 2, zone: "main" }),
      stubDeckBuilderCard({ cardId: "c", cardName: "Gamma", quantity: 1, zone: "sideboard" }),
    ];
    const printings = [
      stubPrinting({ id: "pa", cardId: "a" }),
      stubPrinting({ id: "pb", cardId: "b" }),
      stubPrinting({ id: "pc", cardId: "c" }),
    ];
    const owned = { pa: 3, pb: 0 };
    const prices = stubPriceLookup({
      pa: { tcgplayer: 1 },
      pb: { tcgplayer: 5 },
      pc: { tcgplayer: 2 },
    });

    const result = computeDeckOwnership(deckCards, printings, owned, "tcgplayer", prices);

    expect(result.totalNeeded).toBe(6);
    expect(result.totalOwned).toBe(3); // 3 of Alpha, 0 of Beta, 0 of Gamma
    expect(result.missingCount).toBe(3); // 0 + 2 + 1
    expect(result.missingCards).toHaveLength(2); // Beta and Gamma
    expect(result.deckValueCents).toBe(15); // 3*1 + 2*5 + 1*2
    expect(result.ownedValueCents).toBe(3); // 3*1
    expect(result.missingValueCents).toBe(12); // 2*5 + 1*2
  });
});

describe("computeDeckOwnership (source-level regression)", () => {
  // React Compiler must NOT compile `computeDeckOwnership` with its own
  // useMemoCache. When a `"use memo"` helper is called from another compiled
  // function, the outer compiler wraps the call in a cache check; on cache
  // hits the call is skipped and the helper's `_c(N)` never fires. That
  // shifts every later `_c` slot in the parent fiber's memoCache and
  // produces "previous cache was allocated with size X but size Y was
  // requested" warnings.
  //
  // `useDeckOwnership` already memoizes this call at its own call site, so
  // an inner `"use memo"` is redundant — and triggers the bug. Keep it off.
  it("does not carry a `use memo` directive", () => {
    const source = readFileSync(path.resolve(__dirname, "./use-deck-ownership.ts"), "utf-8");
    const body = source.match(/export function computeDeckOwnership[\s\S]+?^}/m);
    expect(body, "computeDeckOwnership body not found").not.toBeNull();
    // Strip line comments so the comment referencing `"use memo"` doesn't
    // trip the guard.
    const withoutComments = body![0].replaceAll(/\/\/.*$/gm, "");
    expect(withoutComments).not.toMatch(/^\s*["']use memo["']\s*;/m);
  });
});
