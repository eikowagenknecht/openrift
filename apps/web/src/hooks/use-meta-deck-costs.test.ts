import { priceLookupFromMap } from "@openrift/shared/price-lookup";
import type { MetaDeckCardIndexResponse } from "@openrift/shared/types/api/meta";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let cardIndex: MetaDeckCardIndexResponse = { cards: [], decks: [] };
let printingsByCardId = new Map<string, { id: string; language: string }[]>();
let ownedByPrinting: Record<string, number> | undefined = {};
let priceMap: Record<string, Record<string, number>> = {};
let requestedEnabled: boolean | undefined;

vi.mock("@/hooks/use-meta", () => ({
  useMetaDeckCards: () => ({ data: cardIndex }),
}));
vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ printingsByCardId }),
}));
vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCount: (enabled: boolean) => {
    requestedEnabled = enabled;
    return { data: enabled ? ownedByPrinting : undefined };
  },
}));
vi.mock("@/hooks/use-prices", () => ({
  usePrices: () => priceLookupFromMap(priceMap),
}));
vi.mock("@/hooks/use-effective-language-order", () => ({
  useEffectiveLanguageOrder: () => ["en"],
}));
vi.mock("@/stores/display-store", () => ({
  useDisplayStore: (select: (state: { marketplaceOrder: string[] }) => unknown) =>
    select({ marketplaceOrder: ["cardtrader"] }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useMetaDeckCosts } from "./use-meta-deck-costs";

describe("useMetaDeckCosts", () => {
  beforeEach(() => {
    requestedEnabled = undefined;
    cardIndex = {
      cards: ["card-a", "card-b"],
      decks: [
        { deckId: "deck-1", entries: [0, 2], sideboard: [1, 1] },
        { deckId: "deck-2", entries: [1, 3], sideboard: [] },
      ],
    };
    printingsByCardId = new Map([
      [
        "card-a",
        [
          { id: "print-a1", language: "en" },
          { id: "print-a2", language: "de" },
        ],
      ],
      ["card-b", [{ id: "print-b1", language: "en" }]],
    ]);
    priceMap = {
      "print-a1": { cardtrader: 500 },
      "print-a2": { cardtrader: 100 },
      "print-b1": { cardtrader: 250 },
    };
    ownedByPrinting = {};
  });

  it("values each list at the cheapest printing in the reader's languages", () => {
    const { result } = renderHook(() => useMetaDeckCosts(false, { withCollection: false }));
    expect(result.current?.get("deck-1")).toEqual({
      needed: 2,
      owned: undefined,
      value: 10,
      toComplete: undefined,
    });
  });

  it("adds the sideboard when asked", () => {
    const { result } = renderHook(() => useMetaDeckCosts(true, { withCollection: false }));
    expect(result.current?.get("deck-1")?.needed).toBe(3);
    expect(result.current?.get("deck-1")?.value).toBe(12.5);
  });

  it("costs the completion once the copies are in", () => {
    ownedByPrinting = { "print-a2": 1 };
    const { result } = renderHook(() => useMetaDeckCosts(false, { withCollection: true }));
    expect(result.current?.get("deck-1")).toEqual({
      needed: 2,
      owned: 1,
      value: 10,
      toComplete: 5,
    });
  });

  it("stays undefined until the copies arrive, so nothing reads as unowned early", () => {
    ownedByPrinting = undefined;
    const { result } = renderHook(() => useMetaDeckCosts(false, { withCollection: true }));
    expect(result.current).toBeUndefined();
  });

  it("leaves the copies collection unsubscribed without a collection", () => {
    renderHook(() => useMetaDeckCosts(false, { withCollection: false }));
    expect(requestedEnabled).toBe(false);
  });
});
