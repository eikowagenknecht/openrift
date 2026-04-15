import type { UnifiedMappingGroupResponse, UnifiedMappingPrintingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildCoverageMapBySlug, computeCardCoverage } from "./marketplace-coverage";

function printing(
  overrides: Partial<UnifiedMappingPrintingResponse> = {},
): UnifiedMappingPrintingResponse {
  return {
    printingId: "p-1",
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

function group(
  printings: UnifiedMappingPrintingResponse[],
  overrides: Partial<UnifiedMappingGroupResponse> = {},
): UnifiedMappingGroupResponse {
  return {
    cardId: "card-1",
    cardSlug: "fireball",
    cardName: "Fireball",
    cardType: "Spell",
    superTypes: [],
    domains: ["Fury"],
    energy: 1,
    might: null,
    setId: "origin",
    setName: "Origin",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: { stagedProducts: [], assignedProducts: [] },
    cardmarket: { stagedProducts: [], assignedProducts: [] },
    cardtrader: { stagedProducts: [], assignedProducts: [] },
    ...overrides,
  };
}

describe("computeCardCoverage", () => {
  it("returns full coverage when every printing is mapped on every marketplace", () => {
    const result = computeCardCoverage(
      group([
        printing({
          printingId: "p-en",
          language: "EN",
          tcgExternalId: 100,
          cmExternalId: 200,
          ctExternalId: 300,
        }),
      ]),
    );
    expect(result.tcgplayer).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardmarket).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardtrader).toEqual({ status: "full", mapped: 1, total: 1 });
  });

  it("returns no coverage when nothing is mapped", () => {
    const result = computeCardCoverage(group([printing({ printingId: "p-en", language: "EN" })]));
    expect(result.tcgplayer.status).toBe("none");
    expect(result.cardmarket.status).toBe("none");
    expect(result.cardtrader.status).toBe("none");
  });

  it("treats TCGplayer as language-aggregate via the EN-only sibling rule", () => {
    // Single sibling group (same shortCode/finish/etc) with EN + ZH printings.
    // TCG only counts the EN sibling; CM counts the group as one (aggregate);
    // CT counts both languages independently.
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-en", language: "EN", tcgExternalId: 100 }),
        printing({ printingId: "p-zh", language: "ZH" }),
      ]),
    );
    expect(result.tcgplayer).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardmarket).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardtrader).toEqual({ status: "none", mapped: 0, total: 2 });
  });

  it("returns na for TCGplayer when the card has no English printings", () => {
    const result = computeCardCoverage(
      group([printing({ printingId: "p-zh", language: "ZH", cmExternalId: 200 })]),
    );
    expect(result.tcgplayer).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.cardmarket).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardtrader).toEqual({ status: "none", mapped: 0, total: 1 });
  });

  it("treats Cardmarket as fan-out: a single mapping covers every sibling language", () => {
    // One sibling group, both EN and ZH printings, CM mapped on EN only.
    // The fan-out rule means CM coverage is full for the group.
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-en", language: "EN", cmExternalId: 200 }),
        printing({ printingId: "p-zh", language: "ZH" }),
      ]),
    );
    expect(result.cardmarket).toEqual({ status: "full", mapped: 1, total: 1 });
  });

  it("returns partial Cardmarket coverage when only one sibling group is mapped", () => {
    const result = computeCardCoverage(
      group([
        printing({
          printingId: "p-normal-en",
          finish: "normal",
          language: "EN",
          cmExternalId: 200,
        }),
        printing({ printingId: "p-foil-en", finish: "foil", language: "EN" }),
      ]),
    );
    expect(result.cardmarket).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("counts CardTrader per printing — partial when only one language is mapped", () => {
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-en", language: "EN", ctExternalId: 300 }),
        printing({ printingId: "p-zh", language: "ZH" }),
      ]),
    );
    expect(result.cardtrader).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("groups siblings by every physical-card field, not just shortCode", () => {
    // Two printings with the same shortCode but different finishes are NOT
    // siblings — they're separate sibling groups for CM coverage purposes.
    const result = computeCardCoverage(
      group([
        printing({
          printingId: "p-normal",
          finish: "normal",
          isSigned: false,
          cmExternalId: 200,
        }),
        printing({
          printingId: "p-foil",
          finish: "foil",
          isSigned: false,
        }),
        printing({
          printingId: "p-signed",
          finish: "normal",
          isSigned: true,
        }),
      ]),
    );
    expect(result.cardmarket).toEqual({ status: "partial", mapped: 1, total: 3 });
  });

  it("returns na for every marketplace when the card has no printings", () => {
    const result = computeCardCoverage(group([]));
    expect(result.tcgplayer.status).toBe("na");
    expect(result.cardmarket.status).toBe("na");
    expect(result.cardtrader.status).toBe("na");
  });
});

describe("buildCoverageMapBySlug", () => {
  it("indexes coverage by card slug", () => {
    const map = buildCoverageMapBySlug([
      group([printing({ tcgExternalId: 100 })], { cardSlug: "fireball" }),
      group([printing({ printingId: "p-2", language: "ZH" })], {
        cardSlug: "blizzard",
        cardId: "card-2",
      }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get("fireball")?.tcgplayer.status).toBe("full");
    expect(map.get("blizzard")?.tcgplayer.status).toBe("na");
  });

  it("returns an empty map for empty input", () => {
    expect(buildCoverageMapBySlug([])).toEqual(new Map());
  });
});
