import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { computeScanSessionSummary } from "./scan-session-summary";

const p1 = stubPrinting({ id: "p1", cardId: "c1" });
const p2 = stubPrinting({ id: "p2", cardId: "c2" });
const p3 = stubPrinting({ id: "p3", cardId: "c3" });

const prices: Record<string, number> = { p1: 2.5, p2: 10, p3: 1 };

const noWishes = () => false;
const nothingOwned = () => 0;

describe("computeScanSessionSummary", () => {
  it("multiplies prices by count and sums the session value", () => {
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 2 },
        { printing: p2, count: 1 },
      ],
      {
        priceOf: (id) => prices[id],
        isWished: noWishes,
        ownedBefore: null,
      },
    );

    expect(summary.cards).toBe(3);
    expect(summary.totalValue).toBe(15);
    expect(summary.unpricedCards).toBe(0);
  });

  it("picks the highest unit value as the best pull, not the highest row total", () => {
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 10 },
        { printing: p2, count: 1 },
      ],
      {
        priceOf: (id) => prices[id],
        isWished: noWishes,
        ownedBefore: null,
      },
    );

    expect(summary.best?.printing.id).toBe("p2");
    expect(summary.best?.value).toBe(10);
  });

  it("counts unpriced cards instead of adding them as zero, and keeps them out of best", () => {
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 1 },
        { printing: p2, count: 3 },
      ],
      {
        priceOf: (id) => (id === "p1" ? prices[id] : undefined),
        isWished: noWishes,
        ownedBefore: null,
      },
    );

    expect(summary.unpricedCards).toBe(3);
    expect(summary.totalValue).toBe(2.5);
    expect(summary.best?.printing.id).toBe("p1");
  });

  it("leaves best null when nothing scanned had a price", () => {
    const summary = computeScanSessionSummary([{ printing: p1, count: 2 }], {
      priceOf: () => undefined,
      isWished: noWishes,
      ownedBefore: null,
    });

    expect(summary.best).toBeNull();
    expect(summary.totalValue).toBe(0);
    expect(summary.unpricedCards).toBe(2);
  });

  it("weights wished cards by count", () => {
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 2 },
        { printing: p2, count: 4 },
      ],
      {
        priceOf: (id) => prices[id],
        isWished: (cardId) => cardId === "c1",
        ownedBefore: null,
      },
    );

    expect(summary.wishedCards).toBe(2);
  });

  it("matches a wish on the printing as well as the card", () => {
    const summary = computeScanSessionSummary([{ printing: p2, count: 1 }], {
      priceOf: (id) => prices[id],
      isWished: (_cardId, printingId) => printingId === "p2",
      ownedBefore: null,
    });

    expect(summary.wishedCards).toBe(1);
  });

  it("reports new cards as unknown while ownership has not loaded", () => {
    const summary = computeScanSessionSummary([{ printing: p1, count: 2 }], {
      priceOf: (id) => prices[id],
      isWished: noWishes,
      ownedBefore: null,
    });

    expect(summary.newCards).toBeNull();
  });

  it("counts every copy of a printing owned nowhere before, and skips already-owned ones", () => {
    const owned: Record<string, number> = { p1: 0, p2: 3, p3: 0 };
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 2 },
        { printing: p2, count: 5 },
        { printing: p3, count: 1 },
      ],
      {
        priceOf: (id) => prices[id],
        isWished: noWishes,
        ownedBefore: (id) => owned[id] ?? 0,
      },
    );

    expect(summary.newCards).toBe(3);
  });

  it("skips rows standing for no cards", () => {
    const summary = computeScanSessionSummary(
      [
        { printing: p1, count: 0 },
        { printing: p2, count: 1 },
      ],
      {
        priceOf: (id) => prices[id],
        isWished: () => true,
        ownedBefore: nothingOwned,
      },
    );

    expect(summary.cards).toBe(1);
    expect(summary.totalValue).toBe(10);
    expect(summary.wishedCards).toBe(1);
    expect(summary.newCards).toBe(1);
    expect(summary.best?.printing.id).toBe("p2");
  });

  it("ignores a negative count the same way", () => {
    const summary = computeScanSessionSummary([{ printing: p1, count: -1 }], {
      priceOf: (id) => prices[id],
      isWished: () => true,
      ownedBefore: nothingOwned,
    });

    expect(summary.cards).toBe(0);
    expect(summary.totalValue).toBe(0);
  });

  it("returns zeros and no best for an empty session", () => {
    const summary = computeScanSessionSummary([], {
      priceOf: (id) => prices[id],
      isWished: noWishes,
      ownedBefore: nothingOwned,
    });

    expect(summary).toEqual({
      cards: 0,
      totalValue: 0,
      unpricedCards: 0,
      wishedCards: 0,
      newCards: 0,
      best: null,
    });
  });

  it("reports unknown new cards for an empty session with no ownership data", () => {
    const summary = computeScanSessionSummary([], {
      priceOf: (id) => prices[id],
      isWished: noWishes,
      ownedBefore: null,
    });

    expect(summary.newCards).toBeNull();
  });
});
