import type {
  ArtVariant,
  CardFilters,
  CardType,
  Domain,
  Finish,
  Rarity,
  SearchField,
  SuperType,
} from "@openrift/shared";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SetInfo } from "@/components/cards/card-grid";
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

const SETS: SetInfo[] = [{ id: "set-1", slug: "rb1", name: "RB1", setType: "main" }];

function emptyFilters(): CardFilters {
  return {
    search: "",
    searchScope: [] as SearchField[],
    sets: [] as string[],
    languages: [] as string[],
    domains: [] as Domain[],
    types: [] as CardType[],
    superTypes: [] as SuperType[],
    rarities: [] as Rarity[],
    artVariants: [] as ArtVariant[],
    finishes: [] as Finish[],
    isSigned: null,
    hasAnyMarker: null,
    markerSlugs: [] as string[],
    distributionChannelSlugs: [] as string[],
    customTagSlugs: [] as string[],
    isBanned: null,
    hasErrata: null,
    energy: { min: null, max: null },
    might: { min: null, max: null },
    power: { min: null, max: null },
    price: { min: null, max: null },
  };
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
