import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
} from "@openrift/shared";
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

const CARD_A_ID = "00000000-0000-0000-0000-000000000001";
const CARD_B_ID = "00000000-0000-0000-0000-000000000002";
const PRINTING_A_ID = "00000000-0000-0000-0000-000000000011";
const PRINTING_B_ID = "00000000-0000-0000-0000-000000000012";
const SET_ID = "00000000-0000-0000-0000-000000000099";

const stubCardValue: CatalogResponseCardValue = {
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

function stubPrintingValue(
  overrides: Partial<CatalogResponsePrintingValue> = {},
): CatalogResponsePrintingValue {
  return {
    shortCode: "RB1-001",
    setId: SET_ID,
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
    cardId: CARD_A_ID,
    ...overrides,
  };
}

const CATALOG_RESPONSE: CatalogResponse = {
  sets: [
    {
      id: SET_ID,
      slug: "RB1",
      name: "First Set",
      releasedAt: null,
    },
  ],
  cards: {
    [CARD_A_ID]: { ...stubCardValue, name: "Card A" },
    [CARD_B_ID]: { ...stubCardValue, slug: "RB1-002", name: "Card B" },
  },
  printings: {
    [PRINTING_A_ID]: stubPrintingValue({
      cardId: CARD_A_ID,
    }),
    [PRINTING_B_ID]: stubPrintingValue({
      shortCode: "RB1-002",
      cardId: CARD_B_ID,
    }),
  },
  totalCopies: 150,
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

    expect(Object.keys(raw.printings)).toHaveLength(2);
    expect(raw.sets).toEqual([
      {
        id: SET_ID,
        slug: "RB1",
        name: "First Set",
        releasedAt: null,
      },
    ]);
    expect(raw.totalCopies).toBe(150);
  });

  it("enrichCatalog joins card data onto printings and restores ids", () => {
    // Test the select/enrichment function directly
    const select = catalogQueryOptions.select!;
    const enriched = select(CATALOG_RESPONSE);

    expect(enriched.allPrintings).toHaveLength(2);

    const printingA = enriched.printingsById[PRINTING_A_ID];
    const printingB = enriched.printingsById[PRINTING_B_ID];

    expect(printingA?.id).toBe(PRINTING_A_ID);
    expect(printingA?.cardId).toBe(CARD_A_ID);
    expect(printingA?.card.name).toBe("Card A");
    expect(printingB?.card.name).toBe("Card B");

    expect(enriched.cardsById[CARD_A_ID]?.name).toBe("Card A");
    expect(enriched.cardsById[CARD_B_ID]?.name).toBe("Card B");

    expect(enriched.printingsByCardId.get(CARD_A_ID)).toHaveLength(1);
    expect(enriched.printingsByCardId.get(CARD_B_ID)).toHaveLength(1);

    expect(enriched.sets).toEqual([
      {
        id: SET_ID,
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
