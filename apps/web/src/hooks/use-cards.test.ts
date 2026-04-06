import type { Card, CatalogResponse, CatalogPrintingResponse } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement, Suspense } from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { ApiError } from "@/lib/api-client";

import { useCards, catalogQueryOptions } from "./use-cards";

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
  errata: null,
  bans: [],
};

function stubCatalogPrintingResponse(
  overrides: Partial<CatalogPrintingResponse> = {},
): CatalogPrintingResponse {
  return {
    id: "00000000-0000-0000-0000-000000000011",
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
    printedName: null,
    language: "EN",
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
      shortCode: "RB1-002",
      cardId: "00000000-0000-0000-0000-000000000002",
    }),
  ],
  totalCopies: 150,
  languages: [{ code: "EN", name: "English" }],
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
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cards and set info on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/catalog")) {
        return { ok: true, json: () => CATALOG_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.allPrintings).toHaveLength(2));

    expect(result.current.sets).toEqual([
      { id: "00000000-0000-0000-0000-000000000099", slug: "RB1", name: "First Set" },
    ]);
  });

  it("joins card data onto printings and includes market price", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/catalog")) {
        return { ok: true, json: () => CATALOG_RESPONSE };
      }
      return { ok: true, json: () => ({}) };
    });

    const { result } = renderHook(() => useCards(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.allPrintings).toHaveLength(2));

    const cardA = result.current.allPrintings.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000011",
    );
    const cardB = result.current.allPrintings.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000012",
    );

    expect(cardA?.card.name).toBe("Card A");
    expect(cardA?.marketPrice).toBe(1);
    expect(cardB?.card.name).toBe("Card B");
    expect(cardB?.marketPrice).toBeUndefined();
  });

  it("throws an ApiError when catalog fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/catalog")) {
        return { ok: false, status: 500, json: () => ({}) };
      }
      return { ok: true, json: () => ({}) };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    try {
      await queryClient.fetchQuery(catalogQueryOptions);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe("Request failed: 500");
    }
  });
});
