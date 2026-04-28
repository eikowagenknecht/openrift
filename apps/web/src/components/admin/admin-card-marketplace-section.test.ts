import type { StagedProductResponse, UnifiedMappingsCardResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { applyOptimisticAssignmentForCard } from "./admin-card-marketplace-section";
import type { UnifiedMappingGroup, UnifiedMappingPrinting } from "./price-mappings-types";

function printing(overrides: Partial<UnifiedMappingPrinting> = {}): UnifiedMappingPrinting {
  return {
    printingId: "p-en",
    shortCode: "OGN-001",
    rarity: "Common",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: [],
    finish: "normal",
    language: "EN",
    imageUrl: null,
    tcgExternalId: null,
    cmExternalId: null,
    ctExternalId: null,
    ...overrides,
  };
}

function staged(overrides: Partial<StagedProductResponse> = {}): StagedProductResponse {
  return {
    externalId: 1,
    productName: "Product",
    finish: "normal",
    language: "EN",
    marketCents: 100,
    lowCents: null,
    midCents: null,
    highCents: null,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
    currency: "USD",
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

function group(
  cardId: string,
  printings: UnifiedMappingPrinting[],
  perMarketplace: Partial<{
    tcgplayer: { staged: StagedProductResponse[]; assigned: StagedProductResponse[] };
    cardmarket: { staged: StagedProductResponse[]; assigned: StagedProductResponse[] };
    cardtrader: { staged: StagedProductResponse[]; assigned: StagedProductResponse[] };
  }> = {},
): UnifiedMappingGroup {
  const empty = { staged: [], assigned: [] };
  const tcg = { ...empty, ...perMarketplace.tcgplayer };
  const cm = { ...empty, ...perMarketplace.cardmarket };
  const ct = { ...empty, ...perMarketplace.cardtrader };
  return {
    cardId,
    cardSlug: cardId,
    cardName: cardId,
    cardType: "Unit",
    superTypes: [],
    domains: [],
    energy: null,
    might: null,
    setId: "set-1",
    setName: "Set",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: { stagedProducts: tcg.staged, assignedProducts: tcg.assigned, assignments: [] },
    cardmarket: { stagedProducts: cm.staged, assignedProducts: cm.assigned, assignments: [] },
    cardtrader: { stagedProducts: ct.staged, assignedProducts: ct.assigned, assignments: [] },
  };
}

function cardResponse(g: UnifiedMappingGroup | null): UnifiedMappingsCardResponse {
  return { group: g, allCards: [] };
}

describe("applyOptimisticAssignmentForCard", () => {
  it("moves a matching staged variant to assignedProducts on the card group", () => {
    const enPrinting = printing({ printingId: "p-en", language: "EN", finish: "normal" });
    const product = staged({ externalId: 10, language: "EN", finish: "normal" });
    const before = cardResponse(
      group("c-1", [enPrinting], { cardtrader: { staged: [product], assigned: [] } }),
    );
    const after = applyOptimisticAssignmentForCard(
      before,
      "cardtrader",
      10,
      "normal",
      "EN",
      "p-en",
    );
    expect(after.group?.cardtrader.stagedProducts).toEqual([]);
    expect(after.group?.cardtrader.assignedProducts).toEqual([product]);
    expect(after.group?.cardtrader.assignments).toEqual([
      { externalId: 10, printingId: "p-en", finish: "normal", language: "EN" },
    ]);
  });

  it("returns the original response unchanged when the card has no group", () => {
    const before = cardResponse(null);
    const after = applyOptimisticAssignmentForCard(before, "tcgplayer", 1, "normal", null, "p-en");
    expect(after).toBe(before);
  });

  it("returns the original response unchanged when the printing is missing", () => {
    const before = cardResponse(group("c-1", [printing({ printingId: "p-en" })]));
    const after = applyOptimisticAssignmentForCard(
      before,
      "tcgplayer",
      1,
      "normal",
      null,
      "p-missing",
    );
    expect(after).toBe(before);
  });

  it("preserves allCards on the returned response", () => {
    const enPrinting = printing({ printingId: "p-en" });
    const before: UnifiedMappingsCardResponse = {
      group: group("c-1", [enPrinting], {
        tcgplayer: { staged: [staged({ externalId: 10, language: null })], assigned: [] },
      }),
      allCards: [
        {
          cardId: "c-1",
          cardSlug: "alice",
          cardName: "Alice",
          setName: "Origin",
          shortCodes: ["OGN-001"],
        },
      ],
    };
    const after = applyOptimisticAssignmentForCard(before, "tcgplayer", 10, "normal", null, "p-en");
    expect(after.allCards).toBe(before.allCards);
  });
});
