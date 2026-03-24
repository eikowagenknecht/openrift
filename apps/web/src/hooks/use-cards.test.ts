import type { Card, CatalogResponse, CatalogPrintingResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement, Suspense } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { useCards, catalogQueryOptions } from "./use-cards";

vi.mock("@/lib/server-fns", () => ({
  fetchApi: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must come after vi.mock
import { fetchApi } from "@/lib/server-fns";

const stubCard: Card = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "RB1-001",
  name: "Test Card",
  type: "Unit",
  superTypes: [],
  domains: [],
  might: 1,
  energy: 1,
  power: 1,
  keywords: [],
  tags: [],
  mightBonus: 0,
  rulesText: "",
  effectText: "",
};

function stubCatalogPrintingResponse(
  overrides: Partial<CatalogPrintingResponse> = {},
): CatalogPrintingResponse {
  return {
    id: "00000000-0000-0000-0000-000000000011",
    slug: "RB1-001:common:normal:",
    shortCode: "RB1-001",
    setId: "00000000-0000-0000-0000-000000000099",
    collectorNumber: 1,
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    promoType: null,
    finish: "normal",
    images: [],
    artist: "Artist",
    publicCode: "rb1-001",
    printedRulesText: null,
    printedEffectText: null,
    flavorText: null,
    cardId: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

const CATALOG_RESPONSE: CatalogResponse = {
  sets: [{ id: "00000000-0000-0000-0000-000000000099", slug: "RB1", name: "First Set" }],
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
    stubCatalogPrintingResponse({
      id: "00000000-0000-0000-0000-000000000011",
      cardId: "00000000-0000-0000-0000-000000000001",
      marketPrice: 1,
    }),
    stubCatalogPrintingResponse({
      id: "00000000-0000-0000-0000-000000000012",
      slug: "RB1-002:common:normal",
      shortCode: "RB1-002",
      cardId: "00000000-0000-0000-0000-000000000002",
    }),
  ],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Suspense, { fallback: null }, children),
    );
}

describe("useCards", () => {
  beforeEach(() => {
    vi.mocked(fetchApi).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cards and set info on success", async () => {
    vi.mocked(fetchApi).mockResolvedValue(CATALOG_RESPONSE);

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.allCards).toHaveLength(2));

    expect(result.current.setInfoList).toEqual([
      { id: "00000000-0000-0000-0000-000000000099", slug: "RB1", name: "First Set" },
    ]);
  });

  it("joins card data onto printings and includes market price", async () => {
    vi.mocked(fetchApi).mockResolvedValue(CATALOG_RESPONSE);

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.allCards).toHaveLength(2));

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

  it("throws when catalog fetch fails", async () => {
    vi.mocked(fetchApi).mockRejectedValue(new Error("API 500: Internal Server Error"));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await expect(queryClient.fetchQuery(catalogQueryOptions)).rejects.toThrow("API 500");
  });
});
