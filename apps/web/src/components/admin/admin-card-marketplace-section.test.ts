import type {
  StagedProductResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  applyOptimisticAssignment,
  applyOptimisticAssignmentForCard,
} from "./admin-card-marketplace-section";
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

function response(groups: UnifiedMappingGroup[]): UnifiedMappingsResponse {
  return {
    groups,
    allCards: [],
    unmatchedProducts: { tcgplayer: [], cardmarket: [], cardtrader: [] },
  };
}

describe("applyOptimisticAssignment", () => {
  it("moves a matching CT staged variant to assignedProducts and adds the assignment", () => {
    const enPrinting = printing({ printingId: "p-en", language: "EN", finish: "normal" });
    const product = staged({ externalId: 10, language: "EN", finish: "normal" });
    const before = response([
      group("c-1", [enPrinting], { cardtrader: { staged: [product], assigned: [] } }),
    ]);
    const after = applyOptimisticAssignment(before, "c-1", "cardtrader", 10, "p-en");
    const mk = after.groups[0].cardtrader;
    expect(mk.stagedProducts).toEqual([]);
    expect(mk.assignedProducts).toEqual([product]);
    expect(mk.assignments).toEqual([
      { externalId: 10, printingId: "p-en", finish: "normal", language: "EN" },
    ]);
  });

  it("stores Cardmarket assignments with language=null (language-aggregate)", () => {
    const enPrinting = printing({ printingId: "p-en", language: "EN", finish: "normal" });
    const before = response([
      group("c-1", [enPrinting], {
        cardmarket: { staged: [staged({ externalId: 20 })], assigned: [] },
      }),
    ]);
    const after = applyOptimisticAssignment(before, "c-1", "cardmarket", 20, "p-en");
    expect(after.groups[0].cardmarket.assignments[0].language).toBeNull();
  });

  it("picks the correct CT staged variant when multiple languages share an externalId", () => {
    const zhPrinting = printing({ printingId: "p-zh", language: "ZH", finish: "normal" });
    const en = staged({ externalId: 30, language: "EN" });
    const zh = staged({ externalId: 30, language: "ZH" });
    const before = response([
      group("c-1", [zhPrinting], { cardtrader: { staged: [en, zh], assigned: [] } }),
    ]);
    const after = applyOptimisticAssignment(before, "c-1", "cardtrader", 30, "p-zh");
    const mk = after.groups[0].cardtrader;
    expect(mk.stagedProducts).toEqual([en]);
    expect(mk.assignedProducts).toEqual([zh]);
    expect(mk.assignments[0].language).toBe("ZH");
  });

  it("returns the original response unchanged when the card is not in the group list", () => {
    const enPrinting = printing({ printingId: "p-en" });
    const before = response([group("c-other", [enPrinting])]);
    const after = applyOptimisticAssignment(before, "c-missing", "tcgplayer", 1, "p-en");
    expect(after).toBe(before);
  });

  it("returns the original response unchanged when the printing is not in the card", () => {
    const before = response([group("c-1", [printing({ printingId: "p-en" })])]);
    const after = applyOptimisticAssignment(before, "c-1", "tcgplayer", 1, "p-missing");
    expect(after).toBe(before);
  });

  it("still appends an assignment row when staging data is missing (rebind case)", () => {
    // Staging may rotate out after an initial assignment; the server falls back
    // to the existing product row. The optimistic path should still add the
    // assignment so the UI reflects the server's eventual state.
    const before = response([group("c-1", [printing({ printingId: "p-en" })])]);
    const after = applyOptimisticAssignment(before, "c-1", "tcgplayer", 99, "p-en");
    expect(after.groups[0].tcgplayer.assignments).toHaveLength(1);
    expect(after.groups[0].tcgplayer.assignments[0]).toEqual({
      externalId: 99,
      printingId: "p-en",
      finish: "normal",
      language: "EN",
    });
  });

  it("does not mutate the original response", () => {
    const enPrinting = printing({ printingId: "p-en" });
    const product = staged({ externalId: 10 });
    const before = response([
      group("c-1", [enPrinting], { tcgplayer: { staged: [product], assigned: [] } }),
    ]);
    const snapshot = structuredClone(before);
    applyOptimisticAssignment(before, "c-1", "tcgplayer", 10, "p-en");
    expect(before).toEqual(snapshot);
  });
});

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
    const after = applyOptimisticAssignmentForCard(before, "cardtrader", 10, "p-en");
    expect(after.group?.cardtrader.stagedProducts).toEqual([]);
    expect(after.group?.cardtrader.assignedProducts).toEqual([product]);
    expect(after.group?.cardtrader.assignments).toEqual([
      { externalId: 10, printingId: "p-en", finish: "normal", language: "EN" },
    ]);
  });

  it("returns the original response unchanged when the card has no group", () => {
    const before = cardResponse(null);
    const after = applyOptimisticAssignmentForCard(before, "tcgplayer", 1, "p-en");
    expect(after).toBe(before);
  });

  it("returns the original response unchanged when the printing is missing", () => {
    const before = cardResponse(group("c-1", [printing({ printingId: "p-en" })]));
    const after = applyOptimisticAssignmentForCard(before, "tcgplayer", 1, "p-missing");
    expect(after).toBe(before);
  });

  it("preserves allCards on the returned response", () => {
    const enPrinting = printing({ printingId: "p-en" });
    const before: UnifiedMappingsCardResponse = {
      group: group("c-1", [enPrinting], {
        tcgplayer: { staged: [staged({ externalId: 10 })], assigned: [] },
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
    const after = applyOptimisticAssignmentForCard(before, "tcgplayer", 10, "p-en");
    expect(after.allCards).toBe(before.allCards);
  });
});
