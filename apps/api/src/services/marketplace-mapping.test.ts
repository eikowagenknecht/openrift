/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos, Transact } from "../deps.js";
import type { MarketplaceConfig, StagingRow } from "../routes/admin/marketplace-configs.js";
import {
  getMappingOverview,
  saveMappings,
  unmapPrinting,
  unmapAll,
} from "./marketplace-mapping.js";

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
    stagingByExternalIds: vi.fn().mockResolvedValue([]),
    upsertProductVariants: vi.fn().mockResolvedValue([]),
    insertSnapshots: vi.fn().mockResolvedValue(undefined),
    deleteStagingTuples: vi.fn().mockResolvedValue(undefined),
    getVariantForPrinting: vi.fn().mockResolvedValue(undefined),
    getPrintingFinishAndLanguage: vi.fn().mockResolvedValue({ finish: "normal", language: "EN" }),
    snapshotsByVariantId: vi.fn().mockResolvedValue([]),
    deleteSnapshotsByVariantId: vi.fn().mockResolvedValue(undefined),
    deleteVariantById: vi.fn().mockResolvedValue(undefined),
    countMappedVariants: vi.fn().mockResolvedValue(0),
    deleteSnapshotsForMappedVariants: vi.fn().mockResolvedValue(undefined),
    deleteMappedVariants: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockConfig(overrides: Partial<MarketplaceConfig> = {}): MarketplaceConfig {
  return {
    marketplace: "tcgplayer",
    currency: "USD",
    languageAggregate: false,
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
    snapshotQuery: vi.fn().mockResolvedValue([]),
    mapSnapshotPrices: vi.fn(),
    insertSnapshot: vi.fn().mockResolvedValue(undefined),
    insertStagingFromSnapshot: vi.fn().mockResolvedValue(undefined),
    bulkUnmapSql: vi.fn().mockResolvedValue(undefined),
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
  return {
    cardId: "card-1",
    cardSlug: "fireball",
    cardName: "Fireball",
    cardType: "Spell",
    superTypes: [],
    domains: ["Fury"],
    energy: 2,
    might: 3,
    printingId: "printing-1",
    setId: "set-1",
    shortCode: "OGN-001",
    rarity: "Common",
    setName: "Origin Set",
    artVariant: "normal",
    isSigned: false,
    promoTypeSlug: null,
    finish: "normal",
    language: "EN",
    imageUrl: null,
    externalId: null,
    sourceGroupId: null,
    sourceLanguage: null,
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
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "Fireball Product",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ externalId: 12_345, sourceGroupId: 1 })]),
      groupNames: vi.fn().mockResolvedValue([{ gid: 1, name: "Group One" }]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].assignedProducts).toHaveLength(1);
    expect(result.groups[0].assignedProducts[0].productName).toBe("Fireball Product");
    expect(result.groups[0].assignedProducts[0].groupName).toBe("Group One");
  });

  it("uses fallback group name for assigned products with unknown group", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "X",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ externalId: 123, sourceGroupId: 99 })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].assignedProducts[0].groupName).toBe("Group #99");
  });

  it("filters staged products that are already assigned by exact key", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "Fireball",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ externalId: 12_345, sourceGroupId: 1 })]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 12_345, finish: "normal", productName: "Fireball" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    expect(result.groups[0].stagedProducts).toHaveLength(0);
  });

  it("deduplicates assigned products by externalId+finish key", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "p-1",
        productName: "Fireball",
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
        productName: "Fireball",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
        }),
        makeCardPrintingRow({
          printingId: "p-2",
          externalId: 123,
          sourceGroupId: 1,
          finish: "normal",
        }),
      ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    // Both printings share externalId=123 and finish=normal, so only one assigned product
    expect(result.groups[0].assignedProducts).toHaveLength(1);
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
    expect(result.allCards[0].printings).toHaveLength(1);
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
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "Fireball",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    // Should keep this staged product since there's an unmapped foil printing
    expect(result.groups[0].stagedProducts).toHaveLength(1);
  });

  it("uses null sourceGroupId when sourceGroupId is null on assigned product", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "printing-1",
        productName: "Fireball",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
      allCardsWithPrintings: vi
        .fn()
        .mockResolvedValue([makeCardPrintingRow({ externalId: 123, sourceGroupId: null })]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

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

  it("excludes staged product when externalId matches assigned and no unmapped finish", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "p-mapped",
        productName: "Fireball",
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
    const mapSnapshotPrices = vi.fn().mockReturnValue({
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
        // One mapped normal printing — no unmapped foil printing
        makeCardPrintingRow({
          printingId: "p-mapped",
          externalId: 123,
          finish: "normal",
          sourceGroupId: 1,
        }),
      ]),
      allStaging: vi
        .fn()
        .mockResolvedValue([
          makeStagingRow({ externalId: 123, finish: "foil", productName: "Fireball Foil" }),
        ]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery, mapSnapshotPrices });

    const result = await getMappingOverview(repos, config);

    // Staged foil product excluded: externalId 123 is assigned, and there is no
    // unmapped printing with finish "foil"
    expect(result.groups[0].stagedProducts).toHaveLength(0);
  });

  it("does not fetch snapshot prices when no mapped printings", async () => {
    const snapshotQuery = vi.fn().mockResolvedValue([]);
    const mappingRepo = createMockMappingRepo({
      allCardsWithPrintings: vi.fn().mockResolvedValue([makeCardPrintingRow()]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const config = createMockConfig({ snapshotQuery });

    await getMappingOverview(repos, config);
    expect(snapshotQuery).not.toHaveBeenCalled();
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
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
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
      upsertProductVariants: vi.fn().mockResolvedValue([{ printingId: "p-1", variantId: "var-1" }]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345 },
    ]);

    expect(result.saved).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(mappingRepo.insertSnapshots).toHaveBeenCalledTimes(1);
    expect(mappingRepo.deleteStagingTuples).toHaveBeenCalledTimes(1);
    // Snapshot rows use variantId, not productId
    const snapshotArg = (mappingRepo.insertSnapshots as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0] as { variantId: string }[];
    expect(snapshotArg[0].variantId).toBe("var-1");
  });

  it("skips mapping when printing not found", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi.fn().mockResolvedValue([]),
      stagingByExternalIds: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-missing", externalId: 12_345 },
    ]);

    expect(result.saved).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("printing not found");
  });

  it("skips mapping when variant mismatch", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "foil", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
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
      { printingId: "p-1", externalId: 12_345 },
    ]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("variant mismatch");
  });

  it("skips mapping when no staging data found", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345 },
    ]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("no staging data found");
  });

  it("returns 0 saved when all mappings are skipped", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345 },
    ]);

    expect(result.saved).toBe(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("does not insert snapshots when no snapshot rows exist", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
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
      upsertProductVariants: vi.fn().mockResolvedValue([]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    await saveMappings(transact, config, [{ printingId: "p-1", externalId: 12_345 }]);

    expect(mappingRepo.insertSnapshots).not.toHaveBeenCalled();
  });

  it("handles multiple staging rows for same externalId+finish", async () => {
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
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
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
          groupId: 1,
          productName: "X",
          recordedAt: new Date("2026-01-02"),
          marketCents: 200,
          lowCents: null,
          midCents: null,
          highCents: null,
          trendCents: null,
          avg1Cents: null,
          avg7Cents: null,
          avg30Cents: null,
        },
      ]),
      upsertProductVariants: vi.fn().mockResolvedValue([{ printingId: "p-1", variantId: "var-1" }]),
    });
    const repos = { marketplaceMapping: mappingRepo } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await saveMappings(transact, config, [
      { printingId: "p-1", externalId: 12_345 },
    ]);

    expect(result.saved).toBe(1);
    const snapshotArg = mappingRepo.insertSnapshots.mock.calls[0][0];
    expect(snapshotArg).toHaveLength(2);
  });

  it("writes language=null when the marketplace is language-aggregate", async () => {
    const upsertMock = vi.fn().mockResolvedValue([{ printingId: "p-1", variantId: "var-1" }]);
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "EN" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
        {
          externalId: 12_345,
          finish: "normal",
          language: "EN",
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
    const config = createMockConfig({ marketplace: "cardmarket", languageAggregate: true });

    await saveMappings(transact, config, [{ printingId: "p-1", externalId: 12_345 }]);

    // Cardmarket mapping should store the variant with language=null even
    // though the underlying printing is English — the marketplace data
    // itself doesn't know the language.
    expect(upsertMock).toHaveBeenCalledOnce();
    const upsertValues = upsertMock.mock.calls[0][0] as { language: string | null }[];
    expect(upsertValues[0].language).toBeNull();
  });

  it("writes language from the printing when the marketplace is per-language", async () => {
    const upsertMock = vi.fn().mockResolvedValue([{ printingId: "p-1", variantId: "var-1" }]);
    const mappingRepo = createMockMappingRepo({
      printingFinishesAndLanguages: vi
        .fn()
        .mockResolvedValue([{ id: "p-1", finish: "normal", language: "ZH" }]),
      stagingByExternalIds: vi.fn().mockResolvedValue([
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
    const config = createMockConfig({ marketplace: "cardtrader", languageAggregate: false });

    await saveMappings(transact, config, [{ printingId: "p-1", externalId: 12_345 }]);

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
    const repos = {
      marketplaceMapping: mappingRepo,
      marketplaceTransfer: {},
    } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    await unmapPrinting(transact, config, "p-1");

    expect(mappingRepo.deleteSnapshotsByVariantId).not.toHaveBeenCalled();
    expect(mappingRepo.deleteVariantById).not.toHaveBeenCalled();
  });

  it("restores snapshots to staging and deletes variant (parent product preserved)", async () => {
    const mockInsertStagingFromSnapshot = vi.fn().mockResolvedValue(undefined);
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
      snapshotsByVariantId: vi.fn().mockResolvedValue([
        {
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
    });
    const mockTransferRepo = {
      snapshotsByMarketplace: vi.fn().mockResolvedValue([]),
      insertSnapshot: vi.fn().mockResolvedValue(undefined),
      insertStagingFromSnapshot: mockInsertStagingFromSnapshot,
      bulkUnmapToStaging: vi.fn().mockResolvedValue(undefined),
    };
    const repos = {
      marketplaceMapping: mappingRepo,
      marketplaceTransfer: mockTransferRepo,
    } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    await unmapPrinting(transact, config, "p-1");

    expect(mappingRepo.deleteSnapshotsByVariantId).toHaveBeenCalledWith("var-1");
    expect(mappingRepo.deleteVariantById).toHaveBeenCalledWith("var-1");
    expect(mockInsertStagingFromSnapshot).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// unmapAll
// ---------------------------------------------------------------------------

describe("unmapAll", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls bulkUnmapSql and returns count", async () => {
    const mockBulkUnmapToStaging = vi.fn().mockResolvedValue(undefined);
    const mappingRepo = createMockMappingRepo({
      countMappedVariants: vi.fn().mockResolvedValue(5),
    });
    const mockTransferRepo = {
      snapshotsByMarketplace: vi.fn().mockResolvedValue([]),
      insertSnapshot: vi.fn().mockResolvedValue(undefined),
      insertStagingFromSnapshot: vi.fn().mockResolvedValue(undefined),
      bulkUnmapToStaging: mockBulkUnmapToStaging,
    };
    const repos = {
      marketplaceMapping: mappingRepo,
      marketplaceTransfer: mockTransferRepo,
    } as unknown as Repos;
    const transact = mockTransact(repos);
    const config = createMockConfig();

    const result = await unmapAll(transact, config);

    expect(result.unmapped).toBe(5);
    expect(mappingRepo.deleteSnapshotsForMappedVariants).toHaveBeenCalledWith("tcgplayer");
    expect(mappingRepo.deleteMappedVariants).toHaveBeenCalledWith("tcgplayer");
    expect(mockBulkUnmapToStaging).toHaveBeenCalledWith("tcgplayer");
  });
});

// ---------------------------------------------------------------------------
// Helpers (createMockRepos for save/unmap tests)
// ---------------------------------------------------------------------------

function createMockRepos(mappingOverrides: Record<string, unknown> = {}): Repos {
  return {
    marketplaceMapping: createMockMappingRepo(mappingOverrides),
    marketplaceTransfer: {},
  } as unknown as Repos;
}
