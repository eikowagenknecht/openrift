import { filterCards } from "@openrift/shared/filters";
import { getAvailableFilters } from "@openrift/shared/filters-available";
import type { FilterCounts } from "@openrift/shared/filters-counts";
import { computeFilterCounts } from "@openrift/shared/filters-counts";
import { sortCards } from "@openrift/shared/filters-sort";
import { EMPTY_PRICE_LOOKUP } from "@openrift/shared/price-lookup";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { DistributionChannel, Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";
import type { CardFilters, GroupByField, SortOption } from "@openrift/shared/types/search";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import { useDeferredValue } from "react";

import { buildSortCardsOptions, computePriceRanges } from "@/features/cards/lib/card-price-sort";
import { cardsViewTileKey, dedupeToCardsViewTiles } from "@/features/cards/lib/card-tiles";
import type { OwnedBucket } from "@/features/cards/lib/search-schemas";
import {
  applyOwnedBucketFilter,
  applyOwnedCountFilter,
} from "@/features/collections/lib/owned-bucket";
import { useEnumOrders } from "@/hooks/use-enums";
import type { GroupInfo } from "@/lib/card-group-types";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: GroupInfo[];
  filters: CardFilters;
  ownedFilter?: readonly OwnedBucket[];
  ownedCountMin?: number | null;
  ownedCountMax?: number | null;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  groupBy?: GroupByField;
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
  metaEnabled?: boolean;
  countsEnabled?: boolean;
  keywordReverseMap?: Map<string, string>;
  channels?: readonly DistributionChannel[];
  customTagAssignments?: Record<string, readonly string[]>;
}

interface UseCatalogFilterMetaParams {
  allPrintings: Printing[];
  sets: GroupInfo[];
  filters: CardFilters;
  ownedFilter?: readonly OwnedBucket[];
  ownedCountMin?: number | null;
  ownedCountMax?: number | null;
  view: "cards" | "printings";
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
  countsEnabled?: boolean;
  keywordReverseMap?: Map<string, string>;
  channels?: readonly DistributionChannel[];
  customTagAssignments?: Record<string, readonly string[]>;
}

/**
 * A tile's owned count sums all of a card's printings, or only those sharing
 * its set/rarity tile when grouped (see {@link cardsViewTileKey}).
 */
function buildOwnedCounts(
  allPrintings: Printing[],
  displayCards: Printing[],
  ownedCountByPrinting: Record<string, number>,
  view: "cards" | "printings",
  groupBy: GroupByField,
): Map<string, number> {
  const map = new Map<string, number>();
  if (view === "cards") {
    const countByTile = new Map<string, number>();
    for (const p of allPrintings) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      const key = cardsViewTileKey(p, groupBy);
      countByTile.set(key, (countByTile.get(key) ?? 0) + count);
    }
    for (const p of displayCards) {
      const count = countByTile.get(cardsViewTileKey(p, groupBy)) ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  } else {
    for (const p of allPrintings) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      if (count > 0) {
        map.set(p.id, count);
      }
    }
  }
  return map;
}

const EMPTY_PRINTINGS_MAP = new Map<string, Printing[]>();
const NO_OP_LABEL = (slug: string) => slug;
const EMPTY_OWNED_FILTER: readonly OwnedBucket[] = [];

export const EMPTY_FILTER_COUNTS: FilterCounts = {
  sets: new Map<string, number>(),
  languages: new Map<string, number>(),
  domains: new Map<string, number>(),
  types: new Map<string, number>(),
  superTypes: new Map<string, number>(),
  rarities: new Map<string, number>(),
  artVariants: new Map<string, number>(),
  finishes: new Map<string, number>(),
  cardSizes: new Map<string, number>(),
  markers: new Map<string, number>(),
  channels: new Map<string, number>(),
  keywords: new Map<string, number>(),
  tags: new Map<string, number>(),
  flags: { signed: 0, overnumbered: 0, banned: 0, errata: 0, standard: 0 },
  presence: {
    markers: { any: 0, none: 0 },
    superTypes: { any: 0, none: 0 },
    customTags: { any: 0, none: 0 },
    distributionChannels: { any: 0, none: 0 },
    keywords: { any: 0, none: 0 },
    tags: { any: 0, none: 0 },
  },
  ranges: {
    energy: { min: 0, max: 0, hasNullStat: false },
    might: { min: 0, max: 0, hasNullStat: false },
    power: { min: 0, max: 0, hasNullStat: false },
    price: { min: 0, max: 0 },
  },
};

/**
 * When `ownedFilter` is empty, no output depends on `ownedCountByPrinting`,
 * so the returned ref stays stable across +/- clicks on the copies collection.
 */
export function useCatalogFilterMeta({
  allPrintings,
  sets,
  filters,
  ownedFilter,
  ownedCountMin,
  ownedCountMax,
  view,
  ownedCountByPrinting,
  favoriteMarketplace,
  prices,
  enabled = true,
  countsEnabled = true,
  keywordReverseMap,
  channels,
  customTagAssignments,
}: UseCatalogFilterMetaParams) {
  "use memo";

  const { orders } = useEnumOrders();

  // All four inputs must defer together, or the counts transiently mix old
  // and new filter state.
  const countsLive = enabled && countsEnabled;
  const deferredFilters = useDeferredValue(countsLive ? filters : EMPTY_CARD_FILTERS);
  const deferredOwnedFilter = useDeferredValue(countsLive ? ownedFilter : EMPTY_OWNED_FILTER);
  const deferredOwnedCountMin = useDeferredValue(countsLive ? ownedCountMin : null);
  const deferredOwnedCountMax = useDeferredValue(countsLive ? ownedCountMax : null);

  if (!enabled) {
    return {
      availableFilters: getAvailableFilters([], { orders }),
      availableLanguages: [] as string[],
      filterCounts: EMPTY_FILTER_COUNTS,
      setDisplayLabel: NO_OP_LABEL,
    };
  }

  const setSlugToName = new Map(sets.map((s) => [s.slug, s.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const lookup = prices ?? EMPTY_PRICE_LOOKUP;
  const getPrice = (p: Printing) => lookup.get(p.id, favoriteMarketplace);

  const availableFilters = getAvailableFilters(allPrintings, {
    orders,
    sets,
    getPrice,
    channels,
  });
  // Narrow by owned BEFORE computing facet counts, so the other chips
  // reflect the active owned selection.
  const bucketBy = view === "printings" ? "printing" : "card";
  let universeForCounts = allPrintings;
  if (ownedCountByPrinting) {
    if (deferredOwnedFilter && deferredOwnedFilter.length > 0) {
      universeForCounts = applyOwnedBucketFilter(
        universeForCounts,
        deferredOwnedFilter,
        ownedCountByPrinting,
        bucketBy,
      );
    }
    if ((deferredOwnedCountMin ?? null) !== null || (deferredOwnedCountMax ?? null) !== null) {
      universeForCounts = applyOwnedCountFilter(
        universeForCounts,
        deferredOwnedCountMin ?? null,
        deferredOwnedCountMax ?? null,
        ownedCountByPrinting,
        bucketBy,
      );
    }
  }
  const filterCounts = countsLive
    ? computeFilterCounts(universeForCounts, deferredFilters, {
        countBy: view === "cards" ? "card" : "printing",
        keywordReverseMap,
        getPrice,
        customTagAssignments,
      })
    : EMPTY_FILTER_COUNTS;
  const availableLanguages = [...new Set(allPrintings.map((p) => p.language))];

  return { availableFilters, availableLanguages, filterCounts, setDisplayLabel };
}

export function useCardData({
  allPrintings,
  sets,
  filters,
  ownedFilter,
  ownedCountMin,
  ownedCountMax,
  sortBy,
  sortDir,
  view,
  groupBy = "none",
  ownedCountByPrinting,
  favoriteMarketplace,
  prices,
  enabled = true,
  metaEnabled = true,
  countsEnabled = true,
  keywordReverseMap,
  channels,
  customTagAssignments,
}: UseCardDataParams) {
  "use memo";

  const { orders } = useEnumOrders();

  const meta = useCatalogFilterMeta({
    allPrintings,
    sets,
    filters,
    ownedFilter,
    ownedCountMin,
    ownedCountMax,
    view,
    ownedCountByPrinting,
    favoriteMarketplace,
    prices,
    enabled: enabled && metaEnabled,
    countsEnabled,
    keywordReverseMap,
    channels,
    customTagAssignments,
  });

  if (!enabled) {
    return {
      ...meta,
      sortedCards: [] as Printing[],
      printingsByCardId: EMPTY_PRINTINGS_MAP,
      priceRangeByCardId: null,
      ownedCounts: undefined,
      totalUniqueCards: 0,
      filteredCount: 0,
    };
  }

  const lookup = prices ?? EMPTY_PRICE_LOOKUP;
  const getPrice = (p: Printing) => lookup.get(p.id, favoriteMarketplace);

  // allPrintings arrives pre-sorted (userLanguageRank, canonicalRank); the
  // dedup/group below relies on filterCards preserving that order.
  let filteredCards = filterCards(allPrintings, filters, {
    keywordReverseMap,
    getPrice,
    customTagAssignments,
  });

  if (ownedCountByPrinting) {
    const bucketBy = view === "printings" ? "printing" : "card";
    if (ownedFilter && ownedFilter.length > 0) {
      filteredCards = applyOwnedBucketFilter(
        filteredCards,
        ownedFilter,
        ownedCountByPrinting,
        bucketBy,
      );
    }
    if ((ownedCountMin ?? null) !== null || (ownedCountMax ?? null) !== null) {
      filteredCards = applyOwnedCountFilter(
        filteredCards,
        ownedCountMin ?? null,
        ownedCountMax ?? null,
        ownedCountByPrinting,
        bucketBy,
      );
    }
  }

  // Cards view collapses printings into one tile per card, or per
  // (cardId, set)/(cardId, rarity) when grouped by set/rarity.
  const displayCards =
    view === "cards" ? dedupeToCardsViewTiles(filteredCards, groupBy) : filteredCards;

  const printingsByCardId = Map.groupBy(filteredCards, (p) => p.cardId);

  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, lookup, favoriteMarketplace) : null;

  const sortOptions = buildSortCardsOptions({
    sortBy,
    sortDir,
    sets,
    getPrice,
    rarityOrder: orders.rarities,
    priceRangeByCardId,
  });
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  const ownedCounts = ownedCountByPrinting
    ? buildOwnedCounts(allPrintings, displayCards, ownedCountByPrinting, view, groupBy)
    : undefined;

  const totalUniqueCards =
    view === "cards" ? new Set(allPrintings.map((c) => c.cardId)).size : allPrintings.length;

  // In cards+set mode, displayCards has one entry per (cardId, setId), so its
  // length over-counts cards. Match the unit of totalUniqueCards.
  const filteredCount =
    view === "cards" ? new Set(displayCards.map((p) => p.cardId)).size : displayCards.length;

  return {
    ...meta,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    filteredCount,
  };
}
