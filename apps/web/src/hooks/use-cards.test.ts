import type { RiftboundContent, PricesData, Printing } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { useCards, ApiError } from "./use-cards";

// Stub printing for tests
function stubPrinting(overrides: Partial<Printing> = {}): Printing {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "RB1-001:common:normal:",
    sourceId: "RB1-001",
    set: "RB1",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    images: [],
    artist: "Artist",
    publicCode: "rb1-001",
    card: {
      id: "00000000-0000-0000-0000-000000000001",
      slug: "RB1-001",
      name: "Test Card",
      type: "Unit",
      superTypes: [],
      domains: [],
      stats: { might: 1, energy: 1, power: 1 },
      keywords: [],
      tags: [],
      mightBonus: 0,
      description: "",
      effect: "",
    },
    ...overrides,
  };
}

const CARDS_RESPONSE: RiftboundContent = {
  sets: [
    {
      id: "00000000-0000-0000-0000-000000000010",
      slug: "RB1",
      name: "First Set",
      printedTotal: 2,
      printings: [
        stubPrinting({
          id: "00000000-0000-0000-0000-000000000011",
          slug: "RB1-001:common:normal:",
          sourceId: "RB1-001",
          card: { ...stubPrinting().card, name: "Card A" },
        }),
        stubPrinting({
          id: "00000000-0000-0000-0000-000000000012",
          slug: "RB1-002:common:normal",
          sourceId: "RB1-002",
          card: { ...stubPrinting().card, name: "Card B" },
        }),
      ],
    },
  ],
};

const PRICES_RESPONSE: PricesData = {
  prices: {
    "00000000-0000-0000-0000-000000000011": 1,
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

    const withPrice = result.current.allCards.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000011",
    );
    const withoutPrice = result.current.allCards.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000012",
    );

    expect(withPrice?.marketPrice).toBe(1);
    expect(withoutPrice?.marketPrice).toBeUndefined();
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
    expect(result.current.allCards.every((c) => c.marketPrice === undefined)).toBe(true);
  });
});
