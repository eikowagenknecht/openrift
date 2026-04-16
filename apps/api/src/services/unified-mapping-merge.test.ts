/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos } from "../deps.js";
import type { MarketplaceConfig } from "../routes/admin/marketplace-configs.js";
import { buildUnifiedMappingsResponse } from "./unified-mapping-merge.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    cardId: "card-1",
    cardSlug: "card-1-slug",
    cardName: "Flame Striker",
    cardType: "Unit",
    superTypes: [] as string[],
    domains: ["Fire"],
    energy: 2,
    might: 3,
    setId: "set-1",
    setName: "Origins",
    printings: [
      {
        printingId: "p-1",
        shortCode: "OGN-001",
        rarity: "Common",
        artVariant: "normal",
        isSigned: false,
        markerSlugs: [] as string[],
        finish: "normal",
        imageUrl: null,
        externalId: 100,
      },
    ],
    stagedProducts: [] as unknown[],
    assignedProducts: [] as unknown[],
    ...overrides,
  };
}

function makeMappingResult(overrides: Record<string, unknown> = {}) {
  return {
    groups: [],
    unmatchedProducts: [],
    allCards: [],
    ...overrides,
  };
}

function makeConfig(marketplace: string): MarketplaceConfig {
  return { marketplace } as MarketplaceConfig;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("buildUnifiedMappingsResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty groups when all marketplaces have no data", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async () => makeMappingResult());

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      false,
    );

    expect(result.groups).toHaveLength(0);
    expect(result.unmatchedProducts).toEqual({
      tcgplayer: [],
      cardmarket: [],
      cardtrader: [],
    });
  });

  it("merges a card from TCGplayer only", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const tcgGroup = makeGroup();
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [tcgGroup] });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].cardId).toBe("card-1");
    expect(result.groups[0].printings[0].tcgExternalId).toBe(100);
    expect(result.groups[0].printings[0].cmExternalId).toBeNull();
    expect(result.groups[0].printings[0].ctExternalId).toBeNull();
  });

  it("merges external IDs from all three marketplaces into the same card", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [makeGroup()] });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [makeGroup({ printings: [{ printingId: "p-1", externalId: 200 }] })],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [makeGroup({ printings: [{ printingId: "p-1", externalId: 300 }] })],
        });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.groups).toHaveLength(1);
    const printing = result.groups[0].printings[0];
    expect(printing.tcgExternalId).toBe(100);
    expect(printing.cmExternalId).toBe(200);
    expect(printing.ctExternalId).toBe(300);
  });

  it("creates separate groups for cards that only appear in CM or CT", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [makeGroup({ cardId: "card-cm-only" })],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [makeGroup({ cardId: "card-ct-only" })],
        });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.groups).toHaveLength(2);
    const cardIds = result.groups.map((group) => group.cardId);
    expect(cardIds).toContain("card-cm-only");
    expect(cardIds).toContain("card-ct-only");
  });

  it("filters to only incomplete mappings when showAll is false", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const fullyMappedGroup = makeGroup({
      cardId: "fully-mapped",
      printings: [
        {
          printingId: "p-1",
          shortCode: "OGN-001",
          rarity: "Common",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [] as string[],
          finish: "normal",
          imageUrl: null,
          externalId: 100,
        },
      ],
    });
    const incompleteTcgGroup = makeGroup({
      cardId: "incomplete",
      printings: [
        {
          printingId: "p-2",
          shortCode: "OGN-002",
          rarity: "Rare",
          artVariant: "normal",
          isSigned: false,
          markerSlugs: [] as string[],
          finish: "normal",
          imageUrl: null,
          externalId: null,
        },
      ],
    });

    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [fullyMappedGroup, incompleteTcgGroup] });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [
            makeGroup({
              cardId: "fully-mapped",
              printings: [{ printingId: "p-1", externalId: 200 }],
            }),
            makeGroup({
              cardId: "incomplete",
              printings: [{ printingId: "p-2", externalId: 201 }],
            }),
          ],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [
            makeGroup({
              cardId: "fully-mapped",
              printings: [{ printingId: "p-1", externalId: 300 }],
            }),
            makeGroup({
              cardId: "incomplete",
              printings: [{ printingId: "p-2", externalId: 301 }],
            }),
          ],
        });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      false,
    );

    // "fully-mapped" has all 3 externalIds → filtered out
    // "incomplete" has tcgExternalId null → kept
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].cardId).toBe("incomplete");
  });

  it("keeps groups with staged products even when fully mapped", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const groupWithStaged = makeGroup({
      cardId: "with-staged",
      stagedProducts: [{ id: "staged-1" }],
    });

    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [groupWithStaged] });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [
            makeGroup({
              cardId: "with-staged",
              printings: [{ printingId: "p-1", externalId: 200 }],
            }),
          ],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [
            makeGroup({
              cardId: "with-staged",
              printings: [{ printingId: "p-1", externalId: 300 }],
            }),
          ],
        });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      false,
    );

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].cardId).toBe("with-staged");
  });

  it("sorts groups by primaryShortCode", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({
          groups: [
            makeGroup({
              cardId: "card-b",
              printings: [{ printingId: "p-b", shortCode: "OGN-002", externalId: null }],
            }),
            makeGroup({
              cardId: "card-a",
              printings: [{ printingId: "p-a", shortCode: "OGN-001", externalId: null }],
            }),
          ],
        });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.groups[0].primaryShortCode).toBe("OGN-001");
    expect(result.groups[1].primaryShortCode).toBe("OGN-002");
  });

  it("uses the longest allCards list from any marketplace", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ allCards: [{ cardId: "c1" }] });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({ allCards: [{ cardId: "c1" }, { cardId: "c2" }] });
      }
      return makeMappingResult({ allCards: [] });
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.allCards).toHaveLength(2);
  });

  it("collects unmatched products from all marketplaces", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ unmatchedProducts: [{ id: "tcg-unmatched" }] });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({ unmatchedProducts: [{ id: "cm-unmatched" }] });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({ unmatchedProducts: [{ id: "ct-unmatched" }] });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      true,
    );

    expect(result.unmatchedProducts.tcgplayer).toHaveLength(1);
    expect(result.unmatchedProducts.cardmarket).toHaveLength(1);
    expect(result.unmatchedProducts.cardtrader).toHaveLength(1);
  });
});
