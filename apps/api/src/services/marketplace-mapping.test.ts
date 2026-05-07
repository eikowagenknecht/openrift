/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import type { MarketplaceConfig, StagingRow } from "../routes/admin/marketplace-configs.js";
import { getMappingOverview, saveMappings, unmapPrinting } from "./marketplace-mapping.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransact(trxRepos: Repos): Transact {
  return (fn) => fn(trxRepos) as any;
}

function createMockMappingRepo(overrides: Record<string, unknown> = {}) {
  return {
    ignoredProducts: vi.fn().mockResolvedValue([]),
    ignoredVariants: vi.fn().mockResolvedValue([]),
    allStaging: vi.fn().mockResolvedValue([]),
    groupNames: vi.fn().mockResolvedValue([]),
    allCardsWithPrintings: vi.fn().mockResolvedValue([]),
    stagingCardOverrides: vi.fn().mockResolvedValue([]),
    printingFinishesAndLanguages: vi.fn().mockResolvedValue([]),
    productsByExternalIds: vi.fn().mockResolvedValue([]),
    upsertProductVariants: vi.fn().mockResolvedValue([]),
    getVariantForPrinting: vi.fn().mockResolvedValue(undefined),
    getPrintingFinishAndLanguage: vi.fn().mockResolvedValue({ finish: "normal", language: "EN" }),
    deleteVariantById: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockConfig(overrides: Partial<MarketplaceConfig> = {}): MarketplaceConfig {
  return {
    marketplace: "tcgplayer",
    currency: "USD",
    mapStagingPrices: (row: StagingRow) => ({
      marketCents: row.marketCents,
      lowCents: row.lowCents,
      currency: "USD",
      midCents: row.midCents,
      highCents: row.highCents,
      trendCents: row.trendCents,
      avg1Cents: row.avg1Cents,
      avg7Cents: row.avg7Cents,
      avg30Cents: row.avg30Cents,
    }),
    priceQuery: vi.fn().mockResolvedValue([]),
    mapPriceRow: vi.fn(),
    ...overrides,
  };
}

function makeStagingRow(overrides: Partial<StagingRow> = {}): StagingRow {
  return {
    externalId: 12_345,
    groupId: 1,
    productName: "Test Product",
    finish: "normal",
    language: "EN",
    recordedAt: new Date("2026-01-15T10:00:00Z"),
    marketCents: 500,
    lowCents: 400,
    midCents: 500,
    highCents: 600,
    trendCents: 500,
    avg1Cents: 480,
    avg7Cents: 490,
    avg30Cents: 495,
    ...overrides,
  };
}

function makeCardPrintingRow(overrides: Record<string, unknown> = {}) {
  // NB: if you override `externalId` with a real value, also supply
  // `productFinish` (and `sourceLanguage` for per-language marketplaces) —
  // those describe the bound SKU and drive the assigned-products list.
  return {
    cardId: "card-1",
    cardSlug: "fireball",
    cardName: "Fireball",
    cardType: "spell",
    superTypes: [],
    domains: ["fury"],
    energy: 2,
    might: 3,
    printingId: "printing-1",
    setId: "set-1",
    shortCode: "OGN-001",
    rarity: "common",
    setName: "Origin Set",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: [] as string[],
    finish: "normal",
    language: "EN",
    imageUrl: null,
    externalId: null,
    sourceGroupId: null,
    sourceLanguage: null,
    productFinish: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getMappingOverview
// ---------------------------------------------------------------------------

describe("getMappingOverview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty groups when no cards or staging data exist", async () => {
    const mappingRepo = createMockMappingRepo();
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups).toEqual([]);
    expect(result.unmatchedProducts).toEqual([]);
    expect(result.ignoredProducts).toEqual([]);
    expect(result.allCards).toEqual([]);
  });

  it("builds card groups from matched cards", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].cardId).toBe("card-1");
    expect(result.groups[0].cardName).toBe("Fireball");
    expect(result.groups[0].printings).toHaveLength(1);
  });

  it("matches staged products to cards by name prefix", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
      allStaging: vi.fn().mockResolvedValue([makeStagingRow({ productName: "Fireball (normal)" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(1);
    expect(result.unmatchedProducts).toHaveLength(0);
  });

  it("matches staged products via manual override", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 99, productName: "Completely Different Name" }),
        ]),
      stagingCardOverrides: vi
        .fn()
        .mockResolvedValue([
          { externalId: 99, finish: "normal", language: "EN", cardId: "card-1" },
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(1);
    expect(result.groups[0].stagedProducts[0].isOverride).toBe(true);
  });

  it("matches staged products via containment (second pass)", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ cardName: "Daughter of the Void" })]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ productName: "KaiSa Daughter of the Void" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(1);
    expect(result.unmatchedProducts).toHaveLength(0);
  });

  it("matches via baseName containment for cards with dash suffix", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ cardName: "Wuju Bladesman - Starter" })]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ productName: "Master Yi Wuju Bladesman" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(1);
  });

  it("skips containment match when name is too short (< 5)", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow({ cardName: "Ax" })]),
      allStaging: vi.fn().mockResolvedValue([makeStagingRow({ productName: "Battle Ax of Fury" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(0);
    expect(result.unmatchedProducts).toHaveLength(1);
  });

  it("does not steal products belonging to a longer-named card when scoped to one card", async () => {
    // Regression: /admin/cards/blast-cone scopes matchedCards to just "Blast
    // Cone", but both "Blast Cone" and "Blastcone Fae" products exist in
    // staging. Without allCardsForMatching, the shorter alias `blastcone`
    // would match `blastconefae` via startsWith and pull the Fae product
    // onto the Blast Cone page.
    const mappingRepo = createMockMappingRepo({
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 1, productName: "Blast Cone" }),
          makeStagingRow({ externalId: 2, productName: "Blastcone Fae" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config, {
      matchedCards: [makeCardPrintingRow({ cardId: "card-blast-cone", cardName: "Blast Cone" })],
      allCardsForMatching: [
        { cardId: "card-blast-cone", cardName: "Blast Cone" },
        { cardId: "card-blastcone-fae", cardName: "Blastcone Fae" },
      ],
    });

    const productIds = result.groups[0].stagedProducts.map((p) => p.externalId);
    expect(productIds).toEqual([1]);
    // The Fae row has been matched to another (out-of-scope) card, so it
    // shouldn't resurface as unmatched either.
    expect(result.unmatchedProducts.map((p) => p.externalId)).not.toContain(2);
  });

  it("reports unmatched products", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ productName: "Completely Unknown Product" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.unmatchedProducts).toHaveLength(1);
    expect(result.unmatchedProducts[0].productName).toBe("Completely Unknown Product");
  });

  it("excludes ignored staging rows via L3 ignoredVariants", async () => {
    const mappingRepo = createMockMappingRepo({
      ignoredVariants: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
          productName: "Ignored Product",
          createdAt: new Date(),
        },
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ externalId: 12_345, finish: "normal" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.unmatchedProducts).toHaveLength(0);
    expect(result.ignoredProducts).toHaveLength(1);
    expect(result.ignoredProducts[0].level).toBe("variant");
  });

  it("excludes staging rows via L2 ignoredProducts (whole-product ignore)", async () => {
    const mappingRepo = createMockMappingRepo({
      ignoredProducts: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          productName: "Ignored Product",
          createdAt: new Date(),
        },
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 12_345, finish: "normal" }),
          makeStagingRow({ externalId: 12_345, finish: "foil" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    // Both SKUs filtered by the single L2 ignore
    expect(result.unmatchedProducts).toHaveLength(0);
    expect(result.ignoredProducts).toHaveLength(1);
    expect(result.ignoredProducts[0].level).toBe("product");
    expect(result.ignoredProducts[0].finish).toBeNull();
  });

  it("builds group name lookup from groupNames repo", async () => {
    const mappingRepo = createMockMappingRepo({
      groupNames: vi.fn().mockResolvedValue([{ gid: 1, name: "Group One" }]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ groupId: 1, externalId: 999, productName: "No Match Product" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.unmatchedProducts[0].groupName).toBe("Group One");
  });

  it("uses fallback group name when group is not in map", async () => {
    const mappingRepo = createMockMappingRepo({
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ groupId: 42, externalId: 999, productName: "No Match Product" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.unmatchedProducts[0].groupName).toBe("Group #42");
  });

  it("includes assigned products from mapped printings", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        externalId: 12_345,
        productName: "Fireball Product",
        finish: "normal",
        language: "EN",
        recordedAt: new Date("2026-01-15"),
        marketCents: 500,
        lowCents: 400,
        midCents: 500,
        highCents: 600,
        trendCents: 500,
        avg1Cents: 480,
        avg7Cents: 490,
        avg30Cents: 495,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball Product",
      marketCents: 500,
      lowCents: 400,
      currency: "USD",
      recordedAt: "2026-01-15T00:00:00.000Z",
      midCents: 500,
      highCents: 600,
      trendCents: 500,
      avg1Cents: 480,
      avg7Cents: 490,
      avg30Cents: 495,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          externalId: 12_345,
          sourceGroupId: 1,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
      groupNames: vi.fn().mockResolvedValue([{ gid: 1, name: "Group One" }]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].assignedProducts).toHaveLength(1);
    expect(result.groups[0].assignedProducts[0].productName).toBe("Fireball Product");
    expect(result.groups[0].assignedProducts[0].groupName).toBe("Group One");
  });

  it("uses fallback group name for assigned products with unknown group", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        externalId: 123,
        productName: "X",
        finish: "normal",
        language: "EN",
        recordedAt: new Date("2026-01-15"),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "X",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: "2026-01-15T00:00:00.000Z",
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          externalId: 123,
          sourceGroupId: 99,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].assignedProducts[0].groupName).toBe("Group #99");
  });

  it("filters staged products that are already assigned by exact key", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        externalId: 12_345,
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: new Date().toISOString(),
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          externalId: 12_345,
          sourceGroupId: 1,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 12_345, finish: "normal", productName: "Fireball" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(0);
  });

  it("deduplicates assigned products by externalId+finish key", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "p-1",
        externalId: 123,
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
      {
        printingId: "p-2",
        externalId: 123,
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: new Date().toISOString(),
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          printingId: "p-1",
          externalId: 123,
          sourceGroupId: 1,
          finish: "normal",
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
        makeCardPrintingRow({
          printingId: "p-2",
          externalId: 123,
          sourceGroupId: 1,
          finish: "normal",
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    // Both printings share externalId=123 and finish=normal, so only one assigned product
    expect(result.groups[0].assignedProducts).toHaveLength(1);
  });

  it("keeps per-finish prices distinct when one externalId has two SKUs bound to the same printing", async () => {
    // Regression: /admin/cards/<slug> randomly switched the displayed price
    // between normal and foil when both SKUs of a single Cardmarket externalId
    // were bound to the same printing. The price-row JOIN drops the finish
    // dimension, and the lookup map keyed only on (printingId, externalId)
    // overwrote one finish's price with the other's.
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        externalId: 100,
        productName: "Body Rune",
        finish: "normal",
        language: "EN",
        recordedAt: new Date("2026-04-01"),
        marketCents: 500,
        lowCents: 400,
        midCents: 500,
        highCents: 600,
        trendCents: 500,
        avg1Cents: 480,
        avg7Cents: 490,
        avg30Cents: 495,
      },
      {
        printingId: "printing-1",
        externalId: 100,
        productName: "Body Rune",
        finish: "foil",
        language: "EN",
        recordedAt: new Date("2026-04-01"),
        marketCents: 1500,
        lowCents: 1300,
        midCents: 1500,
        highCents: 1700,
        trendCents: 1500,
        avg1Cents: 1480,
        avg7Cents: 1490,
        avg30Cents: 1495,
      },
    ]);
    const mapPriceRow = vi.fn().mockImplementation((row) => ({
      productName: row.productName,
      marketCents: row.marketCents,
      lowCents: row.lowCents,
      currency: "EUR",
      recordedAt: row.recordedAt.toISOString(),
      midCents: row.midCents,
      highCents: row.highCents,
      trendCents: row.trendCents,
      avg1Cents: row.avg1Cents,
      avg7Cents: row.avg7Cents,
      avg30Cents: row.avg30Cents,
    }));
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          printingId: "printing-1",
          externalId: 100,
          sourceGroupId: 1,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
        makeCardPrintingRow({
          printingId: "printing-1",
          externalId: 100,
          sourceGroupId: 1,
          productFinish: "foil",
          sourceLanguage: "EN",
        }),
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    const assigned = result.groups[0].assignedProducts;
    expect(assigned).toHaveLength(2);
    const byFinish = new Map(assigned.map((p) => [p.finish, p]));
    expect(byFinish.get("normal")?.marketCents).toBe(500);
    expect(byFinish.get("foil")?.marketCents).toBe(1500);
  });

  it("returns allCards list for manual assignment", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.allCards).toHaveLength(1);
    expect(result.allCards[0].cardId).toBe("card-1");
    expect(result.allCards[0].shortCodes).toHaveLength(1);
  });

  it("builds ignored variants list with group name lookups", async () => {
    const mappingRepo = createMockMappingRepo({
      ignoredVariants: vi.fn().mockResolvedValue([
        {
          externalId: 999,
          finish: "normal",
          language: "EN",
          productName: "Ignored Product",
          createdAt: new Date("2026-01-10"),
        },
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ externalId: 999, finish: "normal", groupId: 5 })]),
      groupNames: vi.fn().mockResolvedValue([{ gid: 5, name: "Set Five" }]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.ignoredProducts).toHaveLength(1);
    expect(result.ignoredProducts[0].productName).toBe("Ignored Product");
    expect(result.ignoredProducts[0].groupName).toBe("Set Five");
    expect(result.ignoredProducts[0].currency).toBe("USD");
  });

  it("uses fallback group name for ignored variant without staging data", async () => {
    const mappingRepo = createMockMappingRepo({
      ignoredVariants: vi.fn().mockResolvedValue([
        {
          externalId: 999,
          finish: "normal",
          language: "EN",
          productName: "Ignored",
          createdAt: new Date(),
        },
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.ignoredProducts[0].groupId).toBeUndefined();
    expect(result.ignoredProducts[0].groupName).toBeUndefined();
  });

  it("keeps staged product when externalId matches assigned but finish has unmapped printing", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: new Date().toISOString(),
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          printingId: "p-mapped",
          externalId: 123,
          finish: "normal",
          sourceGroupId: 1,
        }),
        makeCardPrintingRow({ printingId: "p-unmapped", externalId: null, finish: "foil" }),
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 123, finish: "foil", productName: "Fireball Foil" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    // Should keep this staged product since there's an unmapped foil printing
    expect(result.groups[0].stagedProducts).toHaveLength(1);
  });

  it("uses null sourceGroupId when sourceGroupId is null on assigned product", async () => {
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        externalId: 123,
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: new Date().toISOString(),
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          externalId: 123,
          sourceGroupId: null,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].assignedProducts[0].groupId).toBeUndefined();
    expect(result.groups[0].assignedProducts[0].groupName).toBeUndefined();
  });

  it("groups multiple printings under the same card", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([
          makeCardPrintingRow({ printingId: "p-1", shortCode: "OGN-001" }),
          makeCardPrintingRow({ printingId: "p-2", shortCode: "OGN-002", finish: "foil" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].printings).toHaveLength(2);
  });

  it("skips already-matched rows in second-pass containment matching", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ cardName: "Fireball" })]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ externalId: 1, productName: "Fireball Normal" })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    // Already matched by prefix in first pass, so no double-match
    expect(result.groups[0].stagedProducts).toHaveLength(1);
  });

  it("does not skip override that targets a non-existent card group", async () => {
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
      allStaging: vi
        .fn()
        .mockResolvedValue([makeStagingRow({ externalId: 99, productName: "Override Target" })]),
      stagingCardOverrides: vi
        .fn()
        .mockResolvedValue([
          { externalId: 99, finish: "normal", language: "EN", cardId: "nonexistent-card" },
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig();

    const result = await getMappingOverview(repos, config);

    // Override points to nonexistent card, falls through to prefix matching
    expect(result.unmatchedProducts).toHaveLength(1);
  });

  it("keeps staged foil product when only a normal printing is assigned (uniform per-SKU filter)", async () => {
    // Under the SKU-normalized model, the staged-product filter keys on
    // (externalId, finish, language). Assigning (123, normal, EN) only
    // removes the corresponding staged row — a distinct (123, foil, EN)
    // staged SKU remains visible regardless of marketplace.
    const priceQuery = vi.fn().mockResolvedValue([
      {
        printingId: "p-mapped",
        externalId: 123,
        productName: "Fireball",
        finish: "normal",
        language: "EN",
        recordedAt: new Date(),
        marketCents: 100,
        lowCents: null,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapPriceRow = vi.fn().mockReturnValue({
      productName: "Fireball",
      marketCents: 100,
      lowCents: null,
      currency: "USD",
      recordedAt: new Date().toISOString(),
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([
        makeCardPrintingRow({
          printingId: "p-mapped",
          externalId: 123,
          finish: "normal",
          sourceGroupId: 1,
          productFinish: "normal",
          sourceLanguage: "EN",
        }),
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 123, finish: "foil", productName: "Fireball Foil" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery, mapPriceRow });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(1);
  });

  it("does not fetch snapshot prices when no mapped printings", async () => {
    const priceQuery = vi.fn().mockResolvedValue([]);
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ priceQuery });

    await getMappingOverview(repos, config);
    expect(priceQuery).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// saveMappings
// ---------------------------------------------------------------------------

describe("saveMappings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns zeros when no mappings provided", async () => {
    const repos = createMockRepos();
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, []);

    expect(result.saved).toBe(0);
    expect(result.skipped).toEqual([]);
  });

  it("saves a mapping successfully", async () => {
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
          groupId: 1,
          productName: "Test Product",
          recordedAt: new Date("2026-01-15"),
          marketCents: 500,
          lowCents: 400,
          midCents: 500,
          highCents: 600,
          trendCents: 500,
          avg1Cents: 480,
          avg7Cents: 490,
          avg30Cents: 495,
        },
      ]),
      upsertProductVariants: vi.fn().mockResolvedValue([
        {
          printingId: "p-1",
          externalId: 12_345,
          finish: "normal",
          language: "EN",
          variantId: "var-1",
        },
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: "EN" },
    ]);

    expect(result.saved).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it("skips mapping when no product row exists for the external id", async () => {
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-missing", externalId: 12_345, finish: "normal", language: "EN" },
    ]);

    expect(result.saved).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no marketplace product found");
  });

  it("skips mapping when SKU mismatch", async () => {
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
          groupId: 1,
          productName: "X",
          recordedAt: new Date(),
          marketCents: 100,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "foil", language: "EN" },
    ]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("SKU mismatch");
  });

  it("skips mapping when no marketplace product is found", async () => {
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: "EN" },
    ]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no marketplace product found");
  });

  it("rebinds a historical product to a new printing using the existing product row", async () => {
    // Regression: allow rebinding a historical product (one fetched long ago,
    // possibly without recent prices) to a different printing. saveMappings
    // resolves the SKU through marketplace_products only, so any existing row
    // is enough to drive the upsert.
    const upsertSpy = vi.fn().mockResolvedValue([
      {
        printingId: "p-1",
        externalId: 12_345,
        finish: "normal",
        language: "EN",
        variantId: "v-1",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          productName: "Historical Product",
          groupId: 42,
          finish: "normal",
          language: "EN",
        },
      ]),
      upsertProductVariants: upsertSpy,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: "EN" },
    ]);

    expect(result.skipped).toHaveLength(0);
    expect(result.saved).toBe(1);
    // Upsert reuses the existing product's group_id + product_name.
    expect(upsertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        externalId: 12_345,
        printingId: "p-1",
        groupId: 42,
        productName: "Historical Product",
        finish: "normal",
        language: "EN",
      }),
    ]);
  });

  it("returns SKU mismatch when the product exists for a different finish", async () => {
    // The product row's finish/language describe a different SKU than the
    // requested mapping — surface the mismatch rather than silently binding
    // the wrong row.
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          productName: "X",
          groupId: 1,
          finish: "normal",
          language: "EN",
        },
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "foil", language: "EN" },
    ]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("SKU mismatch");
  });

  it("accepts cross-language assignments on language-aggregate marketplaces", async () => {
    // Regression: Cardmarket stores staging with language=null since the
    // scraper can't observe per-language pricing. A non-EN printing (e.g. ZH)
    // assigned via the suggest UI must still resolve to that null-language
    // staged row when the caller passes language=null — the service no longer
    // guesses from the printing, it trusts the caller's SKU tuple.
    const upsertSpy = vi.fn().mockResolvedValue([
      {
        printingId: "p-zh",
        externalId: 872_479,
        finish: "normal",
        language: null,
        variantId: "v-1",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 872_479,
          finish: "normal",
          language: null,
          groupId: 7,
          productName: "Calm Rune",
        },
      ]),
      upsertProductVariants: upsertSpy,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig({ marketplace: "cardmarket" });

    const result = await saveMappings(transact, config, [
      { printingId: "p-zh", externalId: 872_479, finish: "normal", language: null },
    ]);

    expect(result.skipped).toHaveLength(0);
    expect(result.saved).toBe(1);
    // Variant is upserted with NULL language and the product row's
    // group_id / product_name.
    expect(upsertSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        externalId: 872_479,
        printingId: "p-zh",
        groupId: 7,
        productName: "Calm Rune",
        finish: "normal",
        language: null,
      }),
    ]);
  });

  it("returns 0 saved when all mappings are skipped", async () => {
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: "EN" },
    ]);

    expect(result.saved).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("passes language=null through to the upsert when the caller supplies null", async () => {
    const upsertMock = vi.fn().mockResolvedValue([
      {
        printingId: "p-1",
        externalId: 12_345,
        finish: "normal",
        language: null,
        variantId: "var-1",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: null,
          groupId: 1,
          productName: "X",
          recordedAt: new Date("2026-01-01"),
          marketCents: 100,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
      upsertProductVariants: upsertMock,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig({ marketplace: "cardmarket" });

    await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: null },
    ]);

    // Cardmarket stores NULL language on products; the service just forwards
    // the caller's tuple verbatim.
    expect(upsertMock).toHaveBeenCalledOnce();
    const upsertValues = upsertMock.mock.calls[0][0] as { language: string | null }[];
    expect(upsertValues[0].language).toBeNull();
  });

  it("accepts a metal printing against foil staging and writes finish=foil on the product", async () => {
    // Marketplaces never emit `metal` in staging — metal printings reuse the
    // foil staging rows. The caller supplies finish="foil" explicitly from the
    // product row the admin clicked on; the service just forwards it, and the
    // product row (which is what price refresh joins on) carries finish="foil".
    const upsertMock = vi.fn().mockResolvedValue([
      {
        printingId: "p-metal",
        externalId: 12_345,
        finish: "foil",
        language: "EN",
        variantId: "var-m",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "foil",
          language: "EN",
          groupId: 1,
          productName: "Lee Sin Metal",
          recordedAt: new Date("2026-01-15"),
          marketCents: 2500,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
      upsertProductVariants: upsertMock,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-metal", externalId: 12_345, finish: "foil", language: "EN" },
    ]);

    expect(result.saved).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(upsertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        printingId: "p-metal",
        externalId: 12_345,
        finish: "foil",
        language: "EN",
      }),
    ]);
  });

  it("accepts a metal-deluxe printing against foil staging as well", async () => {
    const upsertMock = vi.fn().mockResolvedValue([
      {
        printingId: "p-md",
        externalId: 22_345,
        finish: "foil",
        language: "EN",
        variantId: "var-md",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 22_345,
          finish: "foil",
          language: "EN",
          groupId: 1,
          productName: "Lee Sin Metal Deluxe",
          recordedAt: new Date("2026-01-15"),
          marketCents: 9900,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
      upsertProductVariants: upsertMock,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-md", externalId: 22_345, finish: "foil", language: "EN" },
    ]);

    expect(result.saved).toBe(1);
    expect(upsertMock).toHaveBeenCalledWith([expect.objectContaining({ finish: "foil" })]);
  });

  it("forwards a non-English language from the caller on per-language marketplaces", async () => {
    const upsertMock = vi.fn().mockResolvedValue([
      {
        printingId: "p-1",
        externalId: 12_345,
        finish: "normal",
        language: "ZH",
        variantId: "var-1",
      },
    ]);
    const mappingRepo = createMockMappingRepo({
      productsByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "ZH",
          groupId: 1,
          productName: "X",
          recordedAt: new Date("2026-01-01"),
          marketCents: 100,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
      upsertProductVariants: upsertMock,
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig({ marketplace: "cardtrader" });

    await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345, finish: "normal", language: "ZH" },
    ]);

    const upsertValues = upsertMock.mock.calls[0][0] as { language: string | null }[];
    expect(upsertValues[0].language).toBe("ZH");
  });
});

// ---------------------------------------------------------------------------
// unmapPrinting
// ---------------------------------------------------------------------------

describe("unmapPrinting", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does nothing when variant does not exist", async () => {
    const mappingRepo = createMockMappingRepo({
      getVariantForPrinting: vi.fn().mockResolvedValue(undefined),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    await unmapPrinting(transact, config, "p-1", 12_345, "normal", null);

    expect(mappingRepo.deleteVariantById).not.toHaveBeenCalled();
  });

  it("deletes just the (printing ↔ product) binding and leaves the product + prices behind", async () => {
    const mappingRepo = createMockMappingRepo({
      getVariantForPrinting: vi.fn().mockResolvedValue({
        variantId: "var-1",
        marketplaceProductId: "mp-1",
        finish: "normal",
        language: "EN",
        externalId: 12_345,
        groupId: 1,
        productName: "Test Product",
        marketplace: "tcgplayer",
      }),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    await unmapPrinting(transact, config, "p-1", 12_345, "normal", "EN");

    expect(mappingRepo.getVariantForPrinting).toHaveBeenCalledWith(
      "tcgplayer",
      "p-1",
      12_345,
      "normal",
      "EN",
    );
    expect(mappingRepo.deleteVariantById).toHaveBeenCalledWith("var-1");
  });

  // CardTrader fans one blueprint id out across multiple (finish, language)
  // rows. Without finish/language the lookup matched both rows and unmapped
  // whichever sort order returned first.
  it("scopes the variant lookup by finish and language so CT siblings don't collide", async () => {
    const mappingRepo = createMockMappingRepo({
      getVariantForPrinting: vi.fn().mockResolvedValue({
        variantId: "var-zh",
        marketplaceProductId: "mp-zh",
        finish: "normal",
        language: "ZH",
        externalId: 12_345,
        groupId: 1,
        productName: "Test Product",
        marketplace: "cardtrader",
      }),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig({ marketplace: "cardtrader" });

    await unmapPrinting(transact, config, "p-1", 12_345, "normal", "ZH");

    expect(mappingRepo.getVariantForPrinting).toHaveBeenCalledWith(
      "cardtrader",
      "p-1",
      12_345,
      "normal",
      "ZH",
    );
    expect(mappingRepo.deleteVariantById).toHaveBeenCalledWith("var-zh");
  });
});

// ---------------------------------------------------------------------------
// Helpers (createMockRepos for save/unmap tests)
// ---------------------------------------------------------------------------

function createMockRepos(mappingOverrides: Record<string, unknown> = {}): Repos {
  return {
    marketplaceMapping: createMockMappingRepo(mappingOverrides),
  } as unknown as Repos;
}
