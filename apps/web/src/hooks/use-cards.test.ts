import type { Card, CatalogResponse, CatalogPrintingResponse } from "@openrift/shared";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Mock createServerFn to execute the handler directly instead of making RPC
// calls. This is necessary because there is no TanStack Start server running
// in the vitest/jsdom environment.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      handler: (fn: (...args: unknown[]) => unknown) => fn,
      middleware: () => chain,
      inputValidator: () => chain,
    };
    return chain;
  },
}));

// Mock server-cache with a test-local QueryClient to avoid cross-test cache
// pollution (the real serverCache is a long-lived singleton).
vi.mock("@/lib/server-cache", async () => {
  const { QueryClient: QC } = await import("@tanstack/react-query");
  return { serverCache: new QC({ defaultOptions: { queries: { retry: false } } }) };
});

// Must import after the mock so the mock is applied.
const { serverCache } = await import("@/lib/server-cache");
const { catalogQueryOptions } = await import("./use-cards");

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
  sets: [
    {
      id: "00000000-0000-0000-0000-000000000099",
      slug: "RB1",
      name: "First Set",
      releasedAt: null,
    },
  ],
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

describe("useCards", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    serverCache.clear();
  });

  it("fetches and returns catalog data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(CATALOG_RESPONSE) }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // fetchQuery returns raw data (without select), so check the raw shape
    const raw = await queryClient.fetchQuery(catalogQueryOptions);

    expect(raw.printings).toHaveLength(2);
    expect(raw.sets).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000099",
        slug: "RB1",
        name: "First Set",
        releasedAt: null,
      },
    ]);
    expect(raw.totalCopies).toBe(150);
    expect(raw.languages).toEqual([{ code: "EN", name: "English" }]);
  });

  it("enrichCatalog joins card data onto printings", () => {
    // Test the select/enrichment function directly
    const select = catalogQueryOptions.select!;
    const enriched = select(CATALOG_RESPONSE);

    expect(enriched.allPrintings).toHaveLength(2);

    const cardA = enriched.allPrintings.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000011",
    );
    const cardB = enriched.allPrintings.find(
      (c) => c.id === "00000000-0000-0000-0000-000000000012",
    );

    expect(cardA?.card.name).toBe("Card A");
    expect(cardA?.marketPrice).toBe(1);
    expect(cardB?.card.name).toBe("Card B");
    expect(cardB?.marketPrice).toBeUndefined();
    expect(enriched.sets).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000099",
        slug: "RB1",
        name: "First Set",
        releasedAt: null,
      },
    ]);
  });

  it("throws an Error when catalog fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    try {
      await queryClient.fetchQuery(catalogQueryOptions);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Catalog fetch failed: 500");
    }
  });
});
