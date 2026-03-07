import type { RiftboundContent, PricesData, Card } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { useCards, ApiError } from "./use-cards";

// Stub card for tests
function stubCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "RB1-001:normal:::normal",
    cardId: "RB1-001",
    sourceId: "RB1-001",
    name: "Test Card",
    type: "Unit",
    superTypes: [],
    rarity: "Common",
    collectorNumber: 1,
    domains: [],
    stats: { might: 1, energy: 1, power: 1 },
    keywords: [],
    description: "",
    effect: "",
    mightBonus: 0,
    set: "RB1",
    art: { imageURL: "", artist: "Artist" },
    tags: [],
    publicCode: "rb1-001",
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    ...overrides,
  };
}

const CARDS_RESPONSE: RiftboundContent = {
  game: "Riftbound",
  version: "2",
  lastUpdated: "2025-01-01",
  sets: [
    {
      id: "RB1",
      name: "First Set",
      printedTotal: 2,
      cards: [
        stubCard({ id: "RB1-001:normal:::normal", sourceId: "RB1-001", name: "Card A" }),
        stubCard({ id: "RB1-002:normal:::normal", sourceId: "RB1-002", name: "Card B" }),
      ],
    },
  ],
};

const PRICES_RESPONSE: PricesData = {
  source: "test",
  fetchedAt: "2025-01-01",
  cards: {
    "RB1-001:normal:::normal": {
      productId: 1,
      low: 0.5,
      mid: 1,
      high: 2,
      market: 1,
    },
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading state initially", () => {
    // oxlint-disable-next-line promise/avoid-new -- need a forever-pending promise
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(Function.prototype as never));

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.allCards).toEqual([]);
    expect(result.current.setInfoList).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("returns cards and set info on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/cards")) {
        return { ok: true, json: () => CARDS_RESPONSE };
      }
      if (url.includes("/api/prices")) {
        return { ok: true, json: () => PRICES_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.allCards).toHaveLength(2);
    expect(result.current.error).toBeNull();

    // setInfoList built from sets
    expect(result.current.setInfoList).toEqual([{ name: "First Set", code: "RB1" }]);
  });

  it("merges price data onto matching cards", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/cards")) {
        return { ok: true, json: () => CARDS_RESPONSE };
      }
      if (url.includes("/api/prices")) {
        return { ok: true, json: () => PRICES_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cardWithPrice = result.current.allCards.find((c) => c.id === "RB1-001:normal:::normal");
    const cardWithoutPrice = result.current.allCards.find(
      (c) => c.id === "RB1-002:normal:::normal",
    );

    expect(cardWithPrice?.price).toBeDefined();
    expect(cardWithPrice?.price?.market).toBe(1);
    expect(cardWithoutPrice?.price).toBeUndefined();
  });

  it("returns an ApiError with health status when cards fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/cards")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      if (url.includes("/api/health")) {
        return { ok: true, json: () => ({ status: "db_empty" }) };
      }
      // prices — never reached due to error, but provide a stub
      return { ok: true, json: () => PRICES_RESPONSE };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).healthStatus).toBe("db_empty");
  });

  it("returns an ApiError with null health when health endpoint is unreachable", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/cards")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      if (url.includes("/api/health")) {
        throw new Error("Network error");
      }
      return { ok: true, json: () => PRICES_RESPONSE };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).healthStatus).toBeNull();
  });

  it("returns cards without prices when prices fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/cards")) {
        return { ok: true, json: () => CARDS_RESPONSE };
      }
      if (url.includes("/api/prices")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      if (url.includes("/api/health")) {
        return { ok: true, json: () => ({ status: "ok" }) };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Cards still available since cardsQuery succeeded
    expect(result.current.allCards).toHaveLength(2);
    expect(result.current.allCards.every((c) => c.price === undefined)).toBe(true);
  });
});
