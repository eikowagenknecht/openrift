/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Repos } from "../deps.js";
import type { MarketplaceConfig } from "../routes/admin/marketplace-configs.js";
import {
  buildUnifiedMappingsCardResponse,
  buildUnifiedMappingsResponse,
} from "./unified-mapping-merge.js";

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

  it("unions printings across marketplaces — a CT-only printing stays visible when TCG/CM also see the card", async () => {
    // Regression: before the fix, a printing that only had a CT variant would
    // be dropped from `group.printings` if TCG was the first marketplace to
    // register the card, because the CT merge path only stamped ctExternalId
    // onto existing printings and never added new ones.
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({
          groups: [
            makeGroup({
              printings: [
                {
                  printingId: "p-shared",
                  shortCode: "OGN-001",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "normal",
                  imageUrl: null,
                  externalId: 100,
                },
              ],
            }),
          ],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [
            makeGroup({
              printings: [
                {
                  printingId: "p-shared",
                  shortCode: "OGN-001",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "normal",
                  imageUrl: null,
                  externalId: 300,
                },
                {
                  printingId: "p-ct-only",
                  shortCode: "ARC-002",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "foil",
                  imageUrl: null,
                  externalId: 346_739,
                },
              ],
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

    expect(result.groups).toHaveLength(1);
    const printingIds = result.groups[0].printings.map((p) => p.printingId);
    expect(printingIds).toContain("p-shared");
    expect(printingIds).toContain("p-ct-only");
    const ctOnly = result.groups[0].printings.find((p) => p.printingId === "p-ct-only");
    expect(ctOnly?.tcgExternalId).toBeNull();
    expect(ctOnly?.cmExternalId).toBeNull();
    expect(ctOnly?.ctExternalId).toBe(346_739);
  });

  it("unions printings across marketplaces — a CM-only printing stays visible when TCG also sees the card", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({
          groups: [
            makeGroup({
              printings: [
                {
                  printingId: "p-shared",
                  shortCode: "OGN-001",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "normal",
                  imageUrl: null,
                  externalId: 100,
                },
              ],
            }),
          ],
        });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [
            makeGroup({
              printings: [
                {
                  printingId: "p-shared",
                  shortCode: "OGN-001",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "normal",
                  imageUrl: null,
                  externalId: 200,
                },
                {
                  printingId: "p-cm-only",
                  shortCode: "OGN-002",
                  rarity: "Common",
                  artVariant: "normal",
                  isSigned: false,
                  markerSlugs: [],
                  finish: "foil",
                  imageUrl: null,
                  externalId: 250,
                },
              ],
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

    const printingIds = result.groups[0].printings.map((p) => p.printingId);
    expect(printingIds).toContain("p-shared");
    expect(printingIds).toContain("p-cm-only");
    const cmOnly = result.groups[0].printings.find((p) => p.printingId === "p-cm-only");
    expect(cmOnly?.tcgExternalId).toBeNull();
    expect(cmOnly?.cmExternalId).toBe(250);
    expect(cmOnly?.ctExternalId).toBeNull();
  });

  it("forwards per-marketplace assignments lists through the merge", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({
          groups: [
            makeGroup({
              assignments: [
                { externalId: 100, printingId: "p-1", finish: "normal", language: "EN" },
              ],
            }),
          ],
        });
      }
      if (config.marketplace === "cardmarket") {
        return makeMappingResult({
          groups: [
            makeGroup({
              assignments: [
                { externalId: 200, printingId: "p-1", finish: "normal", language: null },
                { externalId: 201, printingId: "p-1", finish: "normal", language: null },
              ],
            }),
          ],
        });
      }
      if (config.marketplace === "cardtrader") {
        return makeMappingResult({
          groups: [
            makeGroup({
              assignments: [
                { externalId: 300, printingId: "p-1", finish: "normal", language: "EN" },
              ],
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

    const group = result.groups[0];
    expect(group.tcgplayer.assignments).toEqual([
      { externalId: 100, printingId: "p-1", finish: "normal", language: "EN" },
    ]);
    // Two assignments for the same (printing, marketplace) survive the merge
    // — this is the case a denormalized single-externalId shape would lose.
    expect(group.cardmarket.assignments).toHaveLength(2);
    expect(group.cardmarket.assignments.map((a) => a.externalId).sort()).toEqual([200, 201]);
    expect(group.cardtrader.assignments).toEqual([
      { externalId: 300, printingId: "p-1", finish: "normal", language: "EN" },
    ]);
  });

  it("defaults per-marketplace assignments to empty arrays when a marketplace has no data", async () => {
    const repos = {
      marketplaceMapping: { allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]) },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [makeGroup()] });
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

    expect(result.groups[0].cardmarket.assignments).toEqual([]);
    expect(result.groups[0].cardtrader.assignments).toEqual([]);
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

describe("buildUnifiedMappingsCardResponse", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeScopedCardConfig(marketplace: string): MarketplaceConfig {
    return {
      marketplace,
      currency: "USD",
      mapStagingPrices: (row: {
        marketCents: number | null;
        lowCents: number | null;
        midCents: number | null;
        highCents: number | null;
        trendCents: number | null;
        avg1Cents: number | null;
        avg7Cents: number | null;
        avg30Cents: number | null;
      }) => ({
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
    } as unknown as MarketplaceConfig;
  }

  it("returns {group: null} when the card has no rows", async () => {
    const assignableCardsMock = vi.fn().mockResolvedValue([{ cardId: "c1" }]);
    const stagingMock = vi.fn().mockResolvedValue([]);
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]),
        assignableCards: assignableCardsMock,
        allCardAliases: vi.fn().mockResolvedValue([]),
        stagingForCardAcrossMarketplaces: stagingMock,
      },
    } as unknown as Repos;

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      makeScopedCardConfig("cardtrader"),
      "missing-card",
    );

    expect(result.group).toBeNull();
    expect(result.allCards).toEqual([{ cardId: "c1" }]);
  });

  it("passes the cardIdentifier through to both scoped repo calls", async () => {
    const unifiedMock = vi.fn().mockResolvedValue([]);
    const stagingMock = vi.fn().mockResolvedValue([]);
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: unifiedMock,
        assignableCards: vi.fn().mockResolvedValue([]),
        allCardAliases: vi.fn().mockResolvedValue([]),
        stagingForCardAcrossMarketplaces: stagingMock,
      },
    } as unknown as Repos;

    await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      makeScopedCardConfig("cardtrader"),
      "card-xyz",
    );

    expect(unifiedMock).toHaveBeenCalledWith("card-xyz");
    expect(stagingMock).toHaveBeenCalledWith("card-xyz", ["tcgplayer", "cardmarket", "cardtrader"]);
  });

  it("returns the single merged group plus allCards when the card has data", async () => {
    const repos = {
      marketplaceMapping: {
        // Non-empty unified rows signal "card exists with printings". The row
        // shape has to be rich enough for deriveCardsForMarketplace + the
        // card-index builder to produce a group.
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([
          {
            cardId: "card-1",
            cardSlug: "card-1-slug",
            cardName: "Flame Striker",
            cardType: "Unit",
            superTypes: [],
            domains: ["Fire"],
            energy: 2,
            might: 3,
            printingId: "p-1",
            setId: "set-1",
            shortCode: "OGN-001",
            rarity: "Common",
            setName: "Origins",
            artVariant: "normal",
            isSigned: false,
            markerSlugs: [],
            finish: "normal",
            language: "EN",
            imageUrl: null,
            variantMarketplace: "tcgplayer",
            externalId: 100,
            sourceGroupId: null,
            sourceLanguage: "EN",
          },
        ]),
        assignableCards: vi.fn().mockResolvedValue([
          {
            cardId: "card-1",
            cardSlug: "card-1-slug",
            cardName: "A",
            setName: "S",
            shortCodes: ["OGN-001"],
          },
          {
            cardId: "card-2",
            cardSlug: "card-2-slug",
            cardName: "B",
            setName: "S",
            shortCodes: ["OGN-002"],
          },
        ]),
        allCardAliases: vi.fn().mockResolvedValue([{ cardId: "card-1", normName: "flamestriker" }]),
        stagingForCardAcrossMarketplaces: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Repos;

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      makeScopedCardConfig("cardtrader"),
      "card-1",
    );

    expect(result.group).not.toBeNull();
    expect(result.group?.cardId).toBe("card-1");
    expect(result.allCards).toHaveLength(2);
  });

  it("drops staging rows whose longer alias belongs to another card", async () => {
    // Regression: /admin/cards/blast-cone — SQL returns both "Blast Cone" and
    // "Blastcone Fae" products via the prefix branch; the JS tiebreak against
    // allCardAliases should drop the Fae row because its longer alias points
    // to a different card.
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([
          {
            cardId: "card-blast-cone",
            cardSlug: "blast-cone",
            cardName: "Blast Cone",
            cardType: "Unit",
            superTypes: [],
            domains: ["Fire"],
            energy: 2,
            might: null,
            printingId: "p-bc",
            setId: "set-1",
            shortCode: "OGN-001",
            rarity: "Common",
            setName: "Origins",
            artVariant: "normal",
            isSigned: false,
            markerSlugs: [],
            finish: "normal",
            language: "EN",
            imageUrl: null,
            variantMarketplace: null,
            externalId: null,
            sourceGroupId: null,
            sourceLanguage: null,
          },
        ]),
        assignableCards: vi.fn().mockResolvedValue([
          {
            cardId: "card-blast-cone",
            cardSlug: "blast-cone",
            cardName: "Blast Cone",
            setName: "S",
            shortCodes: ["OGN-001"],
          },
        ]),
        allCardAliases: vi.fn().mockResolvedValue([
          { cardId: "card-blast-cone", normName: "blastcone" },
          { cardId: "card-blastcone-fae", normName: "blastconefae" },
        ]),
        stagingForCardAcrossMarketplaces: vi.fn().mockResolvedValue([
          {
            marketplace: "tcgplayer",
            externalId: 1,
            productName: "Blast Cone",
            finish: "normal",
            language: "EN",
            groupId: 10,
            groupName: "Origins",
            marketCents: 100,
            lowCents: 50,
            midCents: null,
            highCents: null,
            trendCents: null,
            avg1Cents: null,
            avg7Cents: null,
            avg30Cents: null,
            recordedAt: new Date("2026-04-01T00:00:00Z"),
            isOverride: false,
          },
          {
            marketplace: "tcgplayer",
            externalId: 2,
            productName: "Blastcone Fae",
            finish: "normal",
            language: "EN",
            groupId: 10,
            groupName: "Origins",
            marketCents: 200,
            lowCents: 100,
            midCents: null,
            highCents: null,
            trendCents: null,
            avg1Cents: null,
            avg7Cents: null,
            avg30Cents: null,
            recordedAt: new Date("2026-04-01T00:00:00Z"),
            isOverride: false,
          },
        ]),
      },
    } as unknown as Repos;

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      makeScopedCardConfig("cardtrader"),
      "blast-cone",
    );

    const staged = result.group?.tcgplayer.stagedProducts ?? [];
    const ids = staged.map((p) => p.externalId);
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
  });

  it("keeps override-flagged rows even when another card has a longer alias", async () => {
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([
          {
            cardId: "card-blast-cone",
            cardSlug: "blast-cone",
            cardName: "Blast Cone",
            cardType: "Unit",
            superTypes: [],
            domains: ["Fire"],
            energy: 2,
            might: null,
            printingId: "p-bc",
            setId: "set-1",
            shortCode: "OGN-001",
            rarity: "Common",
            setName: "Origins",
            artVariant: "normal",
            isSigned: false,
            markerSlugs: [],
            finish: "normal",
            language: "EN",
            imageUrl: null,
            variantMarketplace: null,
            externalId: null,
            sourceGroupId: null,
            sourceLanguage: null,
          },
        ]),
        assignableCards: vi.fn().mockResolvedValue([
          {
            cardId: "card-blast-cone",
            cardSlug: "blast-cone",
            cardName: "Blast Cone",
            setName: "S",
            shortCodes: ["OGN-001"],
          },
        ]),
        allCardAliases: vi.fn().mockResolvedValue([
          { cardId: "card-blast-cone", normName: "blastcone" },
          { cardId: "card-blastcone-fae", normName: "blastconefae" },
        ]),
        stagingForCardAcrossMarketplaces: vi.fn().mockResolvedValue([
          {
            marketplace: "tcgplayer",
            externalId: 42,
            productName: "Blastcone Fae",
            finish: "normal",
            language: "EN",
            groupId: 10,
            groupName: "Origins",
            marketCents: 200,
            lowCents: 100,
            midCents: null,
            highCents: null,
            trendCents: null,
            avg1Cents: null,
            avg7Cents: null,
            avg30Cents: null,
            recordedAt: new Date("2026-04-01T00:00:00Z"),
            isOverride: true,
          },
        ]),
      },
    } as unknown as Repos;

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      makeScopedCardConfig("cardtrader"),
      "blast-cone",
    );

    const staged = result.group?.tcgplayer.stagedProducts ?? [];
    expect(staged.map((p) => p.externalId)).toContain(42);
    expect(staged[0]?.isOverride).toBe(true);
  });

  it("resolves assigned-product groupName from the unified row when no staging exists", async () => {
    // Regression: /admin/cards/<slug> showed "Group #4425" for a mapped
    // cardtrader printing because the card had no current staging rows — the
    // groupName map was only seeded from staging. Now the unified query carries
    // sourceGroupName and seeds the map up front.
    const snapshotQuery = vi.fn().mockResolvedValue([
      {
        printingId: "p-allay",
        externalId: 379_431,
        productName: "Allay - Eager Admirer",
        recordedAt: new Date("2026-04-01T00:00:00Z"),
        marketCents: 100,
        lowCents: 80,
        midCents: null,
        highCents: null,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      },
    ]);
    const mapSnapshotPrices = vi.fn().mockReturnValue({
      productName: "Allay - Eager Admirer",
      marketCents: 100,
      lowCents: 80,
      currency: "EUR",
      recordedAt: "2026-04-01T00:00:00.000Z",
      midCents: null,
      highCents: null,
      trendCents: null,
      avg1Cents: null,
      avg7Cents: null,
      avg30Cents: null,
    });
    const config = {
      ...makeScopedCardConfig("cardtrader"),
      snapshotQuery,
      mapSnapshotPrices,
    } as unknown as MarketplaceConfig;

    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([
          {
            cardId: "card-allay",
            cardSlug: "allay-eager-admirer",
            cardName: "Allay, Eager Admirer",
            cardType: "Unit",
            superTypes: [],
            domains: ["Body"],
            energy: 1,
            might: 1,
            printingId: "p-allay",
            setId: "set-unleashed",
            shortCode: "OGN-010",
            rarity: "Common",
            setName: "Origins",
            artVariant: "normal",
            isSigned: false,
            markerSlugs: [],
            finish: "normal",
            language: "EN",
            imageUrl: null,
            variantMarketplace: "cardtrader",
            externalId: 379_431,
            sourceGroupId: 4425,
            sourceGroupName: "Unleashed",
            sourceLanguage: "EN",
            productFinish: "normal",
          },
        ]),
        assignableCards: vi.fn().mockResolvedValue([
          {
            cardId: "card-allay",
            cardSlug: "allay-eager-admirer",
            cardName: "Allay, Eager Admirer",
            setName: "Origins",
            shortCodes: ["OGN-010"],
          },
        ]),
        allCardAliases: vi
          .fn()
          .mockResolvedValue([{ cardId: "card-allay", normName: "allayeageradmirer" }]),
        stagingForCardAcrossMarketplaces: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Repos;

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeScopedCardConfig("tcgplayer"),
      makeScopedCardConfig("cardmarket"),
      config,
      "allay-eager-admirer",
    );

    const assigned = result.group?.cardtrader.assignedProducts ?? [];
    expect(assigned).toHaveLength(1);
    expect(assigned[0].groupId).toBe(4425);
    expect(assigned[0].groupName).toBe("Unleashed");
  });
});
