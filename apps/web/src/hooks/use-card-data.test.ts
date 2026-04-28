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
  rarities: ["Common", "Uncommon", "Rare", "Epic"],
  finishes: ["normal", "foil"],
  domains: ["Fury"],
  cardTypes: ["Unit"],
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
    ownedFilter: null,
    sortBy: "name" as const,
    sortDir: "asc" as const,
    view: "printings" as const,
    ownedCountByPrinting: undefined as Record<string, number> | undefined,
    favoriteMarketplace: "tcgplayer" as const,
    prices: EMPTY_PRICE_LOOKUP,
  };
}

describe("useCardData", () => {
  it("narrows non-owned facet counts to the owned subset when owned=owned", () => {
    // Regression: previously the owned filter was applied AFTER computeFilterCounts,
    // so the rarity/set/etc. chips kept showing counts from the entire catalog
    // even when the user had narrowed to owned cards.
    const ownedCommon = stubPrinting({ rarity: "Common" });
    const unownedRare = stubPrinting({ rarity: "Rare" });

    const params = {
      ...baseParams(),
      allPrintings: [ownedCommon, unownedRare],
      ownedFilter: "owned" as const,
      ownedCountByPrinting: { [ownedCommon.id]: 1, [unownedRare.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.rarities.get("Common")).toBe(1);
    expect(result.current.filterCounts.rarities.get("Rare")).toBeUndefined();
  });

  it("keeps the owned-chip count anchored to the pre-owned filtered set", () => {
    // The owned chip count must answer "how many cards would match if I
    // selected owned" — derived from cards filtered by everything EXCEPT
    // owned, so toggling owned doesn't shrink its own count to zero.
    const ownedCommon = stubPrinting({ rarity: "Common" });
    const unownedRare = stubPrinting({ rarity: "Rare" });

    const params = {
      ...baseParams(),
      allPrintings: [ownedCommon, unownedRare],
      ownedFilter: "owned" as const,
      ownedCountByPrinting: { [ownedCommon.id]: 1, [unownedRare.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.flags.owned).toBe(1);
  });

  it("leaves facet counts unchanged when ownedFilter is null", () => {
    const a = stubPrinting({ rarity: "Common" });
    const b = stubPrinting({ rarity: "Rare" });

    const params = {
      ...baseParams(),
      allPrintings: [a, b],
      ownedFilter: null,
      ownedCountByPrinting: { [a.id]: 1, [b.id]: 0 },
    };

    const { result } = renderHook(() => useCardData(params));

    expect(result.current.filterCounts.rarities.get("Common")).toBe(1);
    expect(result.current.filterCounts.rarities.get("Rare")).toBe(1);
  });
});
