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

  it("returns {group: null} when the card has no rows", async () => {
    const assignableCardsMock = vi.fn().mockResolvedValue([{ cardId: "c1" }]);
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([]),
        assignableCards: assignableCardsMock,
      },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async () => makeMappingResult());

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      "missing-card",
    );

    expect(result.group).toBeNull();
    expect(result.allCards).toEqual([{ cardId: "c1" }]);
    // getMappingOverview should be skipped when the card has nothing — avoids
    // 3 pointless round trips.
    expect(getMappingOverview).not.toHaveBeenCalled();
  });

  it("passes the cardId through to allCardsWithPrintingsUnified", async () => {
    const unifiedMock = vi.fn().mockResolvedValue([]);
    const repos = {
      marketplaceMapping: {
        allCardsWithPrintingsUnified: unifiedMock,
        assignableCards: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Repos;

    await buildUnifiedMappingsCardResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      vi.fn(async () => makeMappingResult()),
      "card-xyz",
    );

    expect(unifiedMock).toHaveBeenCalledWith("card-xyz");
  });

  it("returns the single merged group plus allCards when the card has data", async () => {
    const repos = {
      marketplaceMapping: {
        // Non-empty unified rows signal "card exists with printings"; the
        // merge step itself runs off each marketplace's matchedCards, so the
        // shape of these rows isn't validated here.
        allCardsWithPrintingsUnified: vi.fn().mockResolvedValue([{ printingId: "p-1" }]),
        assignableCards: vi.fn().mockResolvedValue([
          { cardId: "card-1", cardName: "A", setName: "S", shortCodes: ["OGN-001"] },
          { cardId: "card-2", cardName: "B", setName: "S", shortCodes: ["OGN-002"] },
        ]),
      },
    } as unknown as Repos;
    const getMappingOverview = vi.fn(async (_repos: Repos, config: MarketplaceConfig) => {
      if (config.marketplace === "tcgplayer") {
        return makeMappingResult({ groups: [makeGroup()] });
      }
      return makeMappingResult();
    });

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      makeConfig("tcgplayer"),
      makeConfig("cardmarket"),
      makeConfig("cardtrader"),
      getMappingOverview,
      "card-1",
    );

    expect(result.group).not.toBeNull();
    expect(result.group?.cardId).toBe("card-1");
    expect(result.group?.printings[0].tcgExternalId).toBe(100);
    expect(result.allCards).toHaveLength(2);
  });
});
