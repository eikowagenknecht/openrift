import type {
  StagedProductResponse,
  UnifiedMappingGroupResponse,
  UnifiedMappingPrintingResponse,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildCoverageMapBySlug, computeCardCoverage } from "./marketplace-coverage";

function printing(
  overrides: Partial<UnifiedMappingPrintingResponse> = {},
): UnifiedMappingPrintingResponse {
  return {
    printingId: "p-1",
    setId: "ogn",
    shortCode: "OGN-001",
    rarity: "common",
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

function stagedProduct(overrides: Partial<StagedProductResponse> = {}): StagedProductResponse {
  return {
    externalId: 999,
    productName: "Mystery",
    finish: "normal",
    language: "EN",
    marketCents: null,
    lowCents: null,
    currency: "USD",
    recordedAt: "2026-01-01T00:00:00Z",
    midCents: null,
    highCents: null,
    trendCents: null,
    avg1Cents: null,
    avg7Cents: null,
    avg30Cents: null,
    ...overrides,
  };
}

interface GroupOverrides extends Partial<UnifiedMappingGroupResponse> {
  tcgStaged?: StagedProductResponse[];
  tcgAssigned?: StagedProductResponse[];
  cmStaged?: StagedProductResponse[];
  cmAssigned?: StagedProductResponse[];
  ctStaged?: StagedProductResponse[];
  ctAssigned?: StagedProductResponse[];
}

function group(
  printings: UnifiedMappingPrintingResponse[],
  overrides: GroupOverrides = {},
): UnifiedMappingGroupResponse {
  // Derive assignments AND assignedProducts from the per-printing externalId
  // fields so the entries-side also reflects the intended fixture state. Real
  // API responses populate `assignments` and `assignedProducts` independently.
  const tcgAssignments = printings
    .filter((p) => p.tcgExternalId !== null)
    .map((p) => ({
      externalId: p.tcgExternalId as number,
      printingId: p.printingId,
      finish: p.finish,
      language: p.language,
    }));
  const cmAssignments = printings
    .filter((p) => p.cmExternalId !== null)
    .map((p) => ({
      externalId: p.cmExternalId as number,
      printingId: p.printingId,
      finish: p.finish,
      language: null as string | null,
    }));
  const ctAssignments = printings
    .filter((p) => p.ctExternalId !== null)
    .map((p) => ({
      externalId: p.ctExternalId as number,
      printingId: p.printingId,
      finish: p.finish,
      language: p.language,
    }));
  const derivedAssigned = (
    eid: (p: UnifiedMappingPrintingResponse) => number | null,
  ): StagedProductResponse[] =>
    printings
      .filter((p) => eid(p) !== null)
      .map((p) =>
        stagedProduct({
          externalId: eid(p) as number,
          finish: p.finish,
          language: p.language,
        }),
      );
  const { tcgStaged, tcgAssigned, cmStaged, cmAssigned, ctStaged, ctAssigned, ...rest } = overrides;
  return {
    cardId: "card-1",
    cardSlug: "fireball",
    cardName: "Fireball",
    cardType: "spell",
    superTypes: [],
    domains: ["fury"],
    energy: 1,
    might: null,
    setId: "origin",
    setName: "Origin",
    primaryShortCode: "OGN-001",
    printings,
    tcgplayer: {
      stagedProducts: tcgStaged ?? [],
      assignedProducts: tcgAssigned ?? derivedAssigned((p) => p.tcgExternalId),
      assignments: tcgAssignments,
    },
    cardmarket: {
      stagedProducts: cmStaged ?? [],
      assignedProducts: cmAssigned ?? derivedAssigned((p) => p.cmExternalId),
      assignments: cmAssignments,
    },
    cardtrader: {
      stagedProducts: ctStaged ?? [],
      assignedProducts: ctAssigned ?? derivedAssigned((p) => p.ctExternalId),
      assignments: ctAssignments,
    },
    ...rest,
  };
}

describe("computeCardCoverage", () => {
  it("returns full both directions when every printing and entry is matched", () => {
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
    expect(result.tcgplayer.printings).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.tcgplayer.entries).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardmarket.printings).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardmarket.entries).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardtrader.printings).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardtrader.entries).toEqual({ status: "full", mapped: 1, total: 1 });
  });

  it("printings=none, entries=na when nothing exists on the marketplace", () => {
    const result = computeCardCoverage(group([printing({ printingId: "p-en", language: "EN" })]));
    expect(result.tcgplayer.printings).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.tcgplayer.entries).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.cardmarket.printings).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardmarket.entries).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.cardtrader.printings).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardtrader.entries).toEqual({ status: "na", mapped: 0, total: 0 });
  });

  it("printings=na, entries=none when only unmatched entries exist", () => {
    const result = computeCardCoverage(
      group([], { tcgStaged: [stagedProduct()], cmStaged: [stagedProduct()] }),
    );
    expect(result.tcgplayer.printings).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.tcgplayer.entries).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardmarket.printings).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.cardmarket.entries).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardtrader.printings).toEqual({ status: "na", mapped: 0, total: 0 });
    expect(result.cardtrader.entries).toEqual({ status: "na", mapped: 0, total: 0 });
  });

  it("counts per printing — EN-only mapping on a EN+ZH card is partial on every marketplace", () => {
    // Post per-SKU refactor: every printing has its own explicit variant (or
    // not), so a ZH printing that isn't mapped shows as a gap regardless of
    // the EN sibling's mapping.
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-en", language: "EN", tcgExternalId: 100 }),
        printing({ printingId: "p-zh", language: "ZH" }),
      ]),
    );
    expect(result.tcgplayer.printings).toEqual({ status: "partial", mapped: 1, total: 2 });
    expect(result.tcgplayer.entries).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardmarket.printings).toEqual({ status: "none", mapped: 0, total: 2 });
    expect(result.cardtrader.printings).toEqual({ status: "none", mapped: 0, total: 2 });
  });

  it("ZH-only card shows full on the marketplace that maps it and none elsewhere", () => {
    const result = computeCardCoverage(
      group([printing({ printingId: "p-zh", language: "ZH", cmExternalId: 200 })]),
    );
    expect(result.tcgplayer.printings).toEqual({ status: "none", mapped: 0, total: 1 });
    expect(result.cardmarket.printings).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.cardtrader.printings).toEqual({ status: "none", mapped: 0, total: 1 });
  });

  it("Cardmarket printings=partial when only one sibling group is mapped", () => {
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
    expect(result.cardmarket.printings).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("CardTrader printings=partial when only one language is mapped", () => {
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-en", language: "EN", ctExternalId: 300 }),
        printing({ printingId: "p-zh", language: "ZH" }),
      ]),
    );
    expect(result.cardtrader.printings).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("entries=partial when every printing is matched but unmatched entries remain", () => {
    const result = computeCardCoverage(
      group(
        [
          printing({
            printingId: "p-en",
            language: "EN",
            tcgExternalId: 100,
            cmExternalId: 200,
            ctExternalId: 300,
          }),
        ],
        { tcgStaged: [stagedProduct({ externalId: 101 })] },
      ),
    );
    expect(result.tcgplayer.printings).toEqual({ status: "full", mapped: 1, total: 1 });
    expect(result.tcgplayer.entries).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("both directions partial when each side has gaps", () => {
    const result = computeCardCoverage(
      group(
        [
          printing({
            printingId: "p-normal-en",
            finish: "normal",
            language: "EN",
            cmExternalId: 200,
          }),
          printing({ printingId: "p-foil-en", finish: "foil", language: "EN" }),
        ],
        { cmStaged: [stagedProduct({ externalId: 201, finish: "etched" })] },
      ),
    );
    expect(result.cardmarket.printings).toEqual({ status: "partial", mapped: 1, total: 2 });
    expect(result.cardmarket.entries).toEqual({ status: "partial", mapped: 1, total: 2 });
  });

  it("groups siblings by every physical-card field, not just shortCode", () => {
    const result = computeCardCoverage(
      group([
        printing({ printingId: "p-normal", finish: "normal", isSigned: false, cmExternalId: 200 }),
        printing({ printingId: "p-foil", finish: "foil", isSigned: false }),
        printing({ printingId: "p-signed", finish: "normal", isSigned: true }),
      ]),
    );
    expect(result.cardmarket.printings).toEqual({ status: "partial", mapped: 1, total: 3 });
  });

  it("everything is na when the card has no printings and no entries", () => {
    const result = computeCardCoverage(group([]));
    expect(result.tcgplayer.printings.status).toBe("na");
    expect(result.tcgplayer.entries.status).toBe("na");
    expect(result.cardmarket.printings.status).toBe("na");
    expect(result.cardmarket.entries.status).toBe("na");
    expect(result.cardtrader.printings.status).toBe("na");
    expect(result.cardtrader.entries.status).toBe("na");
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
    expect(map.get("fireball")?.tcgplayer.printings.status).toBe("full");
    expect(map.get("blizzard")?.tcgplayer.printings.status).toBe("none");
  });

  it("returns an empty map for empty input", () => {
    expect(buildCoverageMapBySlug([])).toEqual(new Map());
  });
});
