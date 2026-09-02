import type { CardFilters } from "@openrift/shared";
import { EMPTY_CARD_FILTERS, EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupInfo } from "@/components/cards/card-grid-types";
import { resetIdCounter, stubPrinting } from "@/test/factories";

const TEST_ORDERS = {
  rarities: ["common", "uncommon", "rare", "epic"],
  finishes: ["normal", "foil"],
  domains: ["fury"],
  cardTypes: ["unit"],
  superTypes: [] as string[],
  artVariants: ["normal", "altart"],
  distributionChannels: [] as string[],
  languages: ["EN"],
};

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: TEST_ORDERS, labels: {} }),
}));

const { useCardData } = await import("./use-card-data");

beforeEach(() => {
  resetIdCounter();
});

const SETS: GroupInfo[] = [{ id: "set-1", slug: "rb1", name: "RB1", setType: "main" }];

function emptyFilters(): CardFilters {
  return { ...EMPTY_CARD_FILTERS };
}

function baseParams() {
  return {
    allPrintings: [],
    sets: SETS,
    filters: emptyFilters(),
    ownedFilter: [] as ("none" | "partial" | "full" | "extra")[],
    sortBy: "name" as const,
    sortDir: "asc" as const,
    view: "printings" as const,
    ownedCountByPrinting: undefined as Record<string, number> | undefined,
    favoriteMarketplace: "tcgplayer" as const,
    prices: EMPTY_PRICE_LOOKUP,
  };
}

describe("useCardData", () => {
  it("narrows non-owned facet counts to the selected owned bucket", () => {
    // Regression: previously the owned filter was applied AFTER computeFilterCounts,
    // so the rarity/set/etc. chips kept showing counts from the entire catalog
    // even when the user had narrowed to owned cards.
    const ownedCommon = stubPrinting({ rarity: "common" });
    const unownedRare = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [ownedCommon, unownedRare],
      ownedFilter: ["partial", "full", "extra"] as const,
      ownedCountByPrinting: { [ownedCommon.id]: 1, [unownedRare.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.rarities.get("common")).toBe(1);
    expect(result.current.filterCounts.rarities.get("rare")).toBeUndefined();
  });

  it("skips the meta computation when metaEnabled is false, keeping grid outputs", () => {
    const a = stubPrinting({ rarity: "common" });
    const b = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [a, b],
      metaEnabled: false,
    };

    const { result } = renderHook(() => useCardData(params));

    // Grid pipeline still runs...
    expect(result.current.sortedCards).toHaveLength(2);
    expect(result.current.filteredCount).toBe(2);
    // ...but the facet meta is the empty fallback.
    expect(result.current.filterCounts.rarities.size).toBe(0);
    expect(result.current.availableFilters.rarities).toHaveLength(0);
  });

  it("skips only the counts pass when countsEnabled is false, keeping availableFilters", () => {
    const a = stubPrinting({ rarity: "common" });
    const b = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [a, b],
      countsEnabled: false,
    };

    const { result } = renderHook(() => useCardData(params));

    // Grid pipeline still runs...
    expect(result.current.sortedCards).toHaveLength(2);
    // ...counts are the empty stand-in (no chip surface visible to read them)...
    expect(result.current.filterCounts.rarities.size).toBe(0);
    // ...but availableFilters stays live, unlike metaEnabled: false.
    expect(result.current.availableFilters.rarities.length).toBeGreaterThan(0);
  });

  it("leaves facet counts unchanged when the owned filter is empty", () => {
    const a = stubPrinting({ rarity: "common" });
    const b = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [a, b],
      ownedFilter: [],
      ownedCountByPrinting: { [a.id]: 1, [b.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.rarities.get("common")).toBe(1);
    expect(result.current.filterCounts.rarities.get("rare")).toBe(1);
  });

  it("filters by the 'none' bucket — only unowned cards survive", () => {
    const owned = stubPrinting({ rarity: "common" });
    const unowned = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [owned, unowned],
      ownedFilter: ["none"] as const,
      ownedCountByPrinting: { [owned.id]: 2, [unowned.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards).toHaveLength(1);
    expect(result.current.sortedCards[0]?.id).toBe(unowned.id);
  });

  it("filters by 'full' — only cards with exactly the playset size match", () => {
    // Default cardType is "unit" → playset size 3.
    const full = stubPrinting({ rarity: "common" });
    const partial = stubPrinting({ rarity: "uncommon" });
    const extra = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [full, partial, extra],
      ownedFilter: ["full"] as const,
      ownedCountByPrinting: { [full.id]: 3, [partial.id]: 1, [extra.id]: 5 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([full.id]);
  });

  it("filters by 'partial' — only cards above zero but below a full playset match", () => {
    const empty = stubPrinting({ rarity: "common" });
    const partial = stubPrinting({ rarity: "uncommon" });
    const full = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [empty, partial, full],
      ownedFilter: ["partial"] as const,
      ownedCountByPrinting: { [empty.id]: 0, [partial.id]: 1, [full.id]: 3 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([partial.id]);
  });

  it("filters by 'extra' — only cards beyond a full playset match", () => {
    const full = stubPrinting({ rarity: "common" });
    const extra = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [full, extra],
      ownedFilter: ["extra"] as const,
      ownedCountByPrinting: { [full.id]: 3, [extra.id]: 7 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([extra.id]);
  });

  it("OR's multiple selected buckets", () => {
    const empty = stubPrinting({ rarity: "common" });
    const partial = stubPrinting({ rarity: "uncommon" });
    const extra = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [empty, partial, extra],
      ownedFilter: ["none", "extra"] as const,
      ownedCountByPrinting: { [empty.id]: 0, [partial.id]: 1, [extra.id]: 5 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id).toSorted()).toEqual(
      [empty.id, extra.id].toSorted(),
    );
  });

  it("filters by a copies-owned range (min..max inclusive)", () => {
    const one = stubPrinting({ rarity: "common" });
    const three = stubPrinting({ rarity: "uncommon" });
    const five = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [one, three, five],
      ownedCountMin: 2,
      ownedCountMax: 4,
      ownedCountByPrinting: { [one.id]: 1, [three.id]: 3, [five.id]: 5 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([three.id]);
  });

  it("treats an open-ended copies-owned min as 'that many and up'", () => {
    const two = stubPrinting({ rarity: "common" });
    const ten = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [two, ten],
      ownedCountMin: 3,
      ownedCountMax: null,
      ownedCountByPrinting: { [two.id]: 2, [ten.id]: 10 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([ten.id]);
  });

  it("narrows non-owned facet counts to the copies-owned range", () => {
    const inRange = stubPrinting({ rarity: "common" });
    const outOfRange = stubPrinting({ rarity: "rare" });

    const params = {
      ...baseParams(),
      allPrintings: [inRange, outOfRange],
      ownedCountMin: 2,
      ownedCountMax: null,
      ownedCountByPrinting: { [inRange.id]: 4, [outOfRange.id]: 1 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.rarities.get("common")).toBe(1);
    expect(result.current.filterCounts.rarities.get("rare")).toBeUndefined();
  });

  it("buckets each printing on its own owned count in printings view", () => {
    // Printings view filters owned per-printing: a variant shows only when its
    // own count matches a selected bucket, not because a sibling variant of the
    // same card is owned. Selecting everything but "none" hides unowned variants.
    const cardId = "shared-card";
    const ownedVariant = stubPrinting({ cardId, shortCode: "A-001" });
    const unownedVariant = stubPrinting({ cardId, shortCode: "B-001" });

    const params = {
      ...baseParams(),
      allPrintings: [ownedVariant, unownedVariant],
      ownedFilter: ["partial", "full", "extra"] as const,
      ownedCountByPrinting: { [ownedVariant.id]: 1, [unownedVariant.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.sortedCards.map((p) => p.id)).toEqual([ownedVariant.id]);
  });

  it("dedupes to one printing per cardId in cards view by default", () => {
    // Regression: same logical card with two printings should collapse to one
    // row when groupBy is anything other than "set" (the catalog default
    // behavior before set-grouping was introduced).
    const cardId = "card-shared";
    const ognPrinting = stubPrinting({ cardId, shortCode: "OGN-001" });
    const sfdPrinting = stubPrinting({ cardId, shortCode: "SFD-001" });

    const { result } = renderHook(() =>
      useCardData({ ...baseParams(), allPrintings: [ognPrinting, sfdPrinting], view: "cards" }),
    );

    expect(result.current.sortedCards).toHaveLength(1);
  });

  it("dedupes per (cardId, setId) when grouping by set in cards view", () => {
    // A reprinted card must appear once under each set it's printed in (so
    // each set section reads as a complete index), but the in-set art-variant
    // printings still collapse to one tile so cards mode stays card-level.
    const cardId = "card-shared";
    const ognSetId = "set-ogn";
    const sfdSetId = "set-sfd";
    const ognNormal = stubPrinting({ cardId, setId: ognSetId, shortCode: "OGN-001" });
    const ognAltart = stubPrinting({ cardId, setId: ognSetId, shortCode: "OGN-001-alt" });
    const sfdNormal = stubPrinting({ cardId, setId: sfdSetId, shortCode: "SFD-001" });

    const { result } = renderHook(() =>
      useCardData({
        ...baseParams(),
        allPrintings: [ognNormal, ognAltart, sfdNormal],
        view: "cards",
        groupBy: "set",
      }),
    );

    expect(result.current.sortedCards).toHaveLength(2);
    expect(result.current.sortedCards.map((p) => p.setId).toSorted()).toEqual([ognSetId, sfdSetId]);
  });

  it("counts unique cards (not per-set tiles) for filteredCount in cards+set mode", () => {
    // Regression: with cards view + groupBy=set, a card reprinted in N sets
    // produced N tiles, so the count display read e.g. "805/769 cards" — the
    // numerator was inflated by reprints while the denominator stayed unique.
    const reprintedCardId = "card-reprinted";
    const uniqueCardId = "card-unique";
    const ognSetId = "set-ogn";
    const sfdSetId = "set-sfd";
    const reprintedOgn = stubPrinting({ cardId: reprintedCardId, setId: ognSetId });
    const reprintedSfd = stubPrinting({ cardId: reprintedCardId, setId: sfdSetId });
    const uniqueOgn = stubPrinting({ cardId: uniqueCardId, setId: ognSetId });

    const { result } = renderHook(() =>
      useCardData({
        ...baseParams(),
        allPrintings: [reprintedOgn, reprintedSfd, uniqueOgn],
        view: "cards",
        groupBy: "set",
      }),
    );

    expect(result.current.sortedCards).toHaveLength(3);
    expect(result.current.totalUniqueCards).toBe(2);
    expect(result.current.filteredCount).toBe(2);
  });

  it("attributes owned counts per set, not per card, when grouping by set in cards view", () => {
    // Regression: a card reprinted in two sets shows one tile per set, but
    // buildOwnedCounts aggregated by cardId only — so both the OGN tile and the
    // UNL tile of the same card reported the card's combined total. Owning 6 of
    // the OGN printing and 0 of the UNL printing made BOTH tiles read "6 owned".
    // Each set tile must reflect only its own set's printings (in-set variants
    // still summed together).
    const cardId = "daring-poro";
    const ognSetId = "set-ogn";
    const unlSetId = "set-unl";
    const ognNormal = stubPrinting({ cardId, setId: ognSetId, shortCode: "OGN-001" });
    const ognAltart = stubPrinting({ cardId, setId: ognSetId, shortCode: "OGN-001-alt" });
    const unlNormal = stubPrinting({ cardId, setId: unlSetId, shortCode: "UNL-001" });

    const { result } = renderHook(() =>
      useCardData({
        ...baseParams(),
        allPrintings: [ognNormal, ognAltart, unlNormal],
        view: "cards",
        groupBy: "set",
        // 5 + 1 OGN copies across its two variants, none of the UNL printing.
        ownedCountByPrinting: {
          [ognNormal.id]: 5,
          [ognAltart.id]: 1,
          [unlNormal.id]: 0,
        },
      }),
    );

    const ownedCounts = result.current.ownedCounts;
    const ognTile = result.current.sortedCards.find((printing) => printing.setId === ognSetId);
    const unlTile = result.current.sortedCards.find((printing) => printing.setId === unlSetId);

    expect(ognTile).toBeDefined();
    expect(unlTile).toBeDefined();
    // OGN tile sums its two in-set variants; UNL tile owns nothing (absent from the map).
    expect(ognTile && ownedCounts?.get(ognTile.id)).toBe(6);
    expect(unlTile && ownedCounts?.get(unlTile.id)).toBeUndefined();
  });

  it("attributes owned counts per rarity when grouping by rarity in cards view", () => {
    // Rarity is a per-printing property, so a card printed at two rarities
    // splits into one tile per rarity and each tile counts only its own rarity's
    // printings — the same per-tile rule as set grouping.
    const cardId = "card-shared";
    const common = stubPrinting({ cardId, rarity: "common", shortCode: "A-001" });
    const rare = stubPrinting({ cardId, rarity: "rare", shortCode: "B-001" });

    const { result } = renderHook(() =>
      useCardData({
        ...baseParams(),
        allPrintings: [common, rare],
        view: "cards",
        groupBy: "rarity",
        ownedCountByPrinting: { [common.id]: 4, [rare.id]: 0 },
      }),
    );

    const ownedCounts = result.current.ownedCounts;
    const commonTile = result.current.sortedCards.find((printing) => printing.rarity === "common");
    const rareTile = result.current.sortedCards.find((printing) => printing.rarity === "rare");

    expect(commonTile).toBeDefined();
    expect(rareTile).toBeDefined();
    expect(commonTile && ownedCounts?.get(commonTile.id)).toBe(4);
    expect(rareTile && ownedCounts?.get(rareTile.id)).toBeUndefined();
  });

  it("sums owned counts across all printings on the single tile in cards view (no set grouping)", () => {
    // The card-level rollup is intentional when a card collapses to one tile:
    // the tile shows your total of that card across every printing.
    const cardId = "card-shared";
    const ognPrinting = stubPrinting({ cardId, setId: "set-ogn", shortCode: "OGN-001" });
    const unlPrinting = stubPrinting({ cardId, setId: "set-unl", shortCode: "UNL-001" });

    const { result } = renderHook(() =>
      useCardData({
        ...baseParams(),
        allPrintings: [ognPrinting, unlPrinting],
        view: "cards",
        ownedCountByPrinting: { [ognPrinting.id]: 2, [unlPrinting.id]: 1 },
      }),
    );

    expect(result.current.sortedCards).toHaveLength(1);
    const tile = result.current.sortedCards[0];
    expect(tile && result.current.ownedCounts?.get(tile.id)).toBe(3);
  });

  it("filteredCount equals printing count in printings view", () => {
    const a = stubPrinting();
    const b = stubPrinting();

    const { result } = renderHook(() =>
      useCardData({ ...baseParams(), allPrintings: [a, b], view: "printings" }),
    );

    expect(result.current.filteredCount).toBe(2);
    expect(result.current.totalUniqueCards).toBe(2);
  });
});
