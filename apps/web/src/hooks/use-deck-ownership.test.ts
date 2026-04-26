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

const EN_FIRST: readonly string[] = ["EN", "DE", "ZH"];

beforeEach(() => {
  resetIdCounter();
});

describe("computeDeckOwnership", () => {
  it("returns all zeros for an empty deck", () => {
    const result = computeDeckOwnership([], [], {}, "tcgplayer", EMPTY_PRICE_LOOKUP, EN_FIRST);

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
      EN_FIRST,
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
      EN_FIRST,
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

    const result = computeDeckOwnership(
      deckCards,
      printings,
      {},
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
    );

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
      EN_FIRST,
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
      EN_FIRST,
    );

    expect(result.totalNeeded).toBe(4);
    expect(result.totalOwned).toBe(3);
    expect(result.missingCount).toBe(1);
  });

  it("computes deck value from the deck row's resolved printing", () => {
    const cardId = "card-1";

    // No preferredPrintingId, so canonical fallback picks EN (p1) over DE (p2).
    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" })];
    const printings = [
      stubPrinting({ id: "p1", cardId, language: "EN" }),
      stubPrinting({ id: "p2", cardId, language: "DE" }),
    ];
    const owned = { p1: 1 };
    const prices = stubPriceLookup({
      p1: { tcgplayer: 5 },
      p2: { tcgplayer: 3 },
    });

    const result = computeDeckOwnership(deckCards, printings, owned, "tcgplayer", prices, EN_FIRST);

    // Resolved printing is EN (p1) at $5, need 2 copies
    expect(result.deckValueCents).toBe(10);
    // Own 1 copy at EN price
    expect(result.ownedValueCents).toBe(5);
    // Missing 1 copy at EN price
    expect(result.missingValueCents).toBe(5);
  });

  it("uses preferredPrintingId when set, even when another language is cheaper", () => {
    // Regression: deck has EN Master Yi pinned; missing-cards dialog must show
    // EN price/short code, not the cheaper ZH variant. (See bug report
    // 2026-04-25: EN deck row was showing ZH prices because the hook picked
    // the global cheapest printing instead of the deck row's chosen one.)
    const cardId = "master-yi";

    const deckCards = [
      stubDeckBuilderCard({ cardId, quantity: 1, zone: "main", preferredPrintingId: "p-en" }),
    ];
    const printings = [
      stubPrinting({ id: "p-en", cardId, language: "EN", shortCode: "OGN-001-EN" }),
      stubPrinting({ id: "p-zh", cardId, language: "ZH", shortCode: "OGN-001-ZH" }),
    ];
    const prices = stubPriceLookup({
      "p-en": { cardtrader: 500 },
      "p-zh": { cardtrader: 100 },
    });

    const result = computeDeckOwnership(deckCards, printings, {}, "cardtrader", prices, EN_FIRST);
    const [entry] = result.missingCards;
    expect(entry?.displayPrinting).toEqual({
      id: "p-en",
      language: "EN",
      shortCode: "OGN-001-EN",
    });
    expect(entry?.displayPrice).toBe(500);
    expect(result.deckValueCents).toBe(500);
  });

  it("falls back to canonical (EN-preferring) printing when no preferredPrintingId", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 1, zone: "main" })];
    const printings = [
      stubPrinting({ id: "p1", cardId, language: "EN", shortCode: "OGN-001" }),
      stubPrinting({ id: "p2", cardId, language: "DE", shortCode: "OGN-002" }),
    ];
    const prices = stubPriceLookup({
      p1: { tcgplayer: 5 },
      p2: { tcgplayer: 3 },
    });

    const result = computeDeckOwnership(deckCards, printings, {}, "tcgplayer", prices, EN_FIRST);
    const [entry] = result.missingCards;
    expect(entry?.displayPrinting).toEqual({ id: "p1", language: "EN", shortCode: "OGN-001" });
    expect(entry?.displayPrice).toBe(5);
  });

  it("omits displayPrice when the resolved printing has no price on the marketplace", () => {
    // Even with cheaper data on a different language variant, we no longer
    // borrow that price — show "--" until the resolved printing has its own.
    const cardId = "card-1";
    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 1, zone: "main" })];
    const printings = [
      stubPrinting({ id: "p1", cardId, language: "EN", shortCode: "OGN-001" }),
      stubPrinting({ id: "p2", cardId, language: "ZH", shortCode: "OGN-001-ZH" }),
    ];
    // Only the ZH printing has a price; canonical EN resolves but has none.
    const prices = stubPriceLookup({ p2: { tcgplayer: 3 } });

    const result = computeDeckOwnership(deckCards, printings, {}, "tcgplayer", prices, EN_FIRST);
    const [entry] = result.missingCards;
    expect(entry?.displayPrinting?.id).toBe("p1");
    expect(entry?.displayPrice).toBeUndefined();
  });

  it("returns undefined values when no price data is available", () => {
    const cardId = "card-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 1, zone: "main" })];
    const printings = [stubPrinting({ id: "p1", cardId })];

    const result = computeDeckOwnership(
      deckCards,
      printings,
      {},
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
    );

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

    const result = computeDeckOwnership(deckCards, printings, {}, "cardmarket", prices, EN_FIRST);

    expect(result.deckValueCents).toBe(8);
  });

  it("treats locked copies as not-owned and reports them per zone", () => {
    // Regression: when a collection is excluded from deck building, the
    // deck-builder should not count its copies as fulfilling the deck. A
    // user with 2 available + 2 locked copies of a 4-of card should see
    // shortfall 2, owned 2, locked 2 — not owned 4.
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 4, zone: "main" })];
    const printings = [stubPrinting({ id: printingId, cardId })];
    const available = { [printingId]: 2 };
    const locked = { [printingId]: 2 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      available,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
      locked,
    );

    expect(result.totalNeeded).toBe(4);
    expect(result.totalOwned).toBe(2);
    expect(result.totalLocked).toBe(2);
    expect(result.missingCount).toBe(2);

    const entry = result.byCardZone.get(`${cardId}:main`);
    expect(entry?.owned).toBe(2);
    expect(entry?.shortfall).toBe(2);
    expect(entry?.locked).toBe(2);
  });

  it("caps locked count at the remaining shortfall", () => {
    // 4 locked copies, but only 1 still missing → locked surfaces as 1.
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 3, zone: "main" })];
    const printings = [stubPrinting({ id: printingId, cardId })];
    const available = { [printingId]: 2 };
    const locked = { [printingId]: 4 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      available,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
      locked,
    );

    expect(result.totalLocked).toBe(1);
    expect(result.byCardZone.get(`${cardId}:main`)?.locked).toBe(1);
  });

  it("distributes locked copies across zones after available is exhausted", () => {
    // Need 2 main + 2 sideboard = 4 total; own 1 available + 2 locked.
    // Available covers main slot 1, locked fills main slot 2 (1 of 2 main
    // shortfall; 1 locked copy remains but main only had 1 missing).
    // Sideboard has 2 missing; the leftover 1 locked covers 1 of them.
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [
      stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" }),
      stubDeckBuilderCard({ cardId, quantity: 2, zone: "sideboard" }),
    ];
    const printings = [stubPrinting({ id: printingId, cardId })];
    const available = { [printingId]: 1 };
    const locked = { [printingId]: 2 };

    const result = computeDeckOwnership(
      deckCards,
      printings,
      available,
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
      locked,
    );

    expect(result.totalOwned).toBe(1);
    expect(result.totalLocked).toBe(2);
    expect(result.missingCount).toBe(3);

    const main = result.byCardZone.get(`${cardId}:main`);
    const side = result.byCardZone.get(`${cardId}:sideboard`);
    expect(main?.owned).toBe(1);
    expect(main?.locked).toBe(1);
    expect(side?.owned).toBe(0);
    expect(side?.locked).toBe(1);
  });

  it("defaults locked to 0 when no locked map is supplied", () => {
    const cardId = "card-1";
    const printingId = "printing-1";

    const deckCards = [stubDeckBuilderCard({ cardId, quantity: 2, zone: "main" })];
    const printings = [stubPrinting({ id: printingId, cardId })];

    const result = computeDeckOwnership(
      deckCards,
      printings,
      { [printingId]: 1 },
      "tcgplayer",
      EMPTY_PRICE_LOOKUP,
      EN_FIRST,
    );

    expect(result.totalLocked).toBe(0);
    expect(result.byCardZone.get(`${cardId}:main`)?.locked).toBe(0);
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

    const result = computeDeckOwnership(deckCards, printings, owned, "tcgplayer", prices, EN_FIRST);

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
