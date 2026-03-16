import type { Card, RiftboundCatalog, CatalogPrinting } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { useCards, ApiError } from "./use-cards";

const stubCard: Card = {
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
};

function stubCatalogPrinting(overrides: Partial<CatalogPrinting> = {}): CatalogPrinting {
  return {
    id: "00000000-0000-0000-0000-000000000011",
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
    cardId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

const CATALOG_RESPONSE: RiftboundCatalog = {
  sets: [{ slug: "RB1", name: "First Set" }],
  cards: {
    "00000000-0000-0000-0000-000000000001": { ...stubCard, name: "Card A" },
    "00000000-0000-0000-0000-000000000002": {
      ...stubCard,
      id: "00000000-0000-0000-0000-000000000002",
      slug: "RB1-002",
      name: "Card B",
    },
  },
  printings: [
    stubCatalogPrinting({
      id: "00000000-0000-0000-0000-000000000011",
      cardId: "00000000-0000-0000-0000-000000000001",
      marketPrice: 1,
    }),
    stubCatalogPrinting({
      id: "00000000-0000-0000-0000-000000000012",
      slug: "RB1-002:common:normal",
      sourceId: "RB1-002",
      cardId: "00000000-0000-0000-0000-000000000002",
    }),
  ],
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
      if (url.includes("/api/catalog")) {
        return { ok: true, json: () => CATALOG_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.allCards).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(result.current.setInfoList).toEqual([{ name: "First Set", code: "RB1" }]);
  });

  it("joins card data onto printings and includes market price", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/catalog")) {
        return { ok: true, json: () => CATALOG_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const cardA = result.current.allCards.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000011",
    );
    const cardB = result.current.allCards.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000012",
    );

    expect(cardA?.card.name).toBe("Card A");
    expect(cardA?.marketPrice).toBe(1);
    expect(cardB?.card.name).toBe("Card B");
    expect(cardB?.marketPrice).toBeUndefined();
  });

  it("returns an ApiError with health status when catalog fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/catalog")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      if (url.includes("/api/health")) {
        return { ok: true, json: () => ({ status: "db_empty" }) };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).healthStatus).toBe("db_empty");
  });

  it("returns an ApiError with null health when health endpoint is unreachable", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/catalog")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      if (url.includes("/api/health")) {
        throw new Error("Network error");
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).healthStatus).toBeNull();
  });
});
