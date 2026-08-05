import type {
  CardFilters,
  DistributionChannel,
  FilterCounts,
  GroupByField,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import {
  computeFilterCounts,
  EMPTY_PRICE_LOOKUP,
  filterCards,
  getAvailableFilters,
  sortCards,
} from "@openrift/shared";
import { useDeferredValue } from "react";

import type { SetInfo } from "@/components/cards/card-grid";
import { useEnumOrders } from "@/hooks/use-enums";
import { cardsViewTileKey, dedupeToCardsViewTiles } from "@/lib/card-tiles";
import { applyOwnedBucketFilter, applyOwnedCountFilter } from "@/lib/owned-bucket";
import type { OwnedBucket } from "@/lib/search-schemas";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  filters: CardFilters;
  /** Selected ownership buckets. Empty array means no owned filter. */
  ownedFilter?: readonly OwnedBucket[];
  /** Inclusive lower bound on copies owned (slider). null = no lower bound. */
  ownedCountMin?: number | null;
  /** Inclusive upper bound on copies owned (slider). null = no upper bound. */
  ownedCountMax?: number | null;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  /**
   * Cards-view grouping axis. When it splits a card (set/rarity) the dedup is
   * per (cardId, set) / (cardId, rarity) so the card shows once per section.
   * Defaults to "none".
   */
  groupBy?: GroupByField;
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
  /**
   * Whether the composed {@link useCatalogFilterMeta} (availableFilters,
   * faceted filterCounts, languages, set labels) is computed. Pass `false`
   * when the caller gets meta from its own `useCatalogFilterMeta` call
   * (/cards) or only consumes this hook's grid outputs in the current mode
   * (the inactive pipeline behind a library/browse toggle). The counts are
   * by far the most expensive part of a filter change, so never compute
   * them twice or for a hidden filter panel. Defaults to `true`.
   */
  metaEnabled?: boolean;
  /** Reverse map from translated keyword labels to canonical names, for cross-language search. */
  keywordReverseMap?: Map<string, string>;
  /**
   * Full distribution-channel registry (including parents that no printing
   * links to directly). Required for the channel filter UI to render full
   * breadcrumbs — without it, `getAvailableFilters` derives channels from the
   * printings alone and parent labels are lost.
   */
  channels?: readonly DistributionChannel[];
  /**
   * Card id → custom-tag slugs lookup. Required only when the freeform deck
   * builder's custom-tag filter is active; standard callers omit this.
   */
  customTagAssignments?: Record<string, readonly string[]>;
}

interface UseCatalogFilterMetaParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  filters: CardFilters;
  ownedFilter?: readonly OwnedBucket[];
  ownedCountMin?: number | null;
  ownedCountMax?: number | null;
  view: "cards" | "printings";
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
  keywordReverseMap?: Map<string, string>;
  channels?: readonly DistributionChannel[];
  customTagAssignments?: Record<string, readonly string[]>;
}

/**
 * Compute min/max market price per cardId from grouped printings, looking up
 * each printing's price on the user's favorite marketplace.
 * @returns A map from cardId to price range.
 */
function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of printings) {
      const price = prices.get(p.id, marketplace);
      if (price !== undefined) {
        min = Math.min(min, price);
        max = Math.max(max, price);
      }
    }
    if (min !== Infinity) {
      map.set(cardId, { min, max });
    }
  }
  return map;
}

/**
 * Build owned-count map keyed by printing ID. In "cards" view a tile collapses
 * several printings, so its representative printing gets the sum of everything
 * it stands in for: all printings of the card normally, but only the printings
 * sharing the tile when grouped by set or rarity (see {@link cardsViewTileKey}).
 * Those axes split a card into one tile per value, so each tile's count must not
 * pull in copies of the card's printings from other sets / rarities.
 * @returns A map from printing ID to owned count.
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

const EMPTY_FILTER_COUNTS: FilterCounts = {
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
  flags: { signed: 0, banned: 0, errata: 0, standard: 0 },
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
 * Filter-meta computation extracted so the catalog filter panel can subscribe
 * to it independently of {@link useCardData}. When `ownedFilter` is empty,
 * none of this hook's outputs depend on `ownedCountByPrinting`, so the
 * returned ref stays stable across +/- clicks on the copies collection.
 *
 * @returns Available filter options, faceted counts, the language list, and a
 *   slug-to-name resolver for set badges.
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
  keywordReverseMap,
  channels,
  customTagAssignments,
}: UseCatalogFilterMetaParams) {
  "use memo";

  const { orders } = useEnumOrders();

  // Facet counts render chip badges, not the grid — they can lag one frame.
  // Deferring the filter inputs keeps the urgent render (grid + chrome
  // structure) free of the counts pass; React then re-renders at deferred
  // priority with the new values and the badges catch up. All four inputs
  // come from the same URL state, so they must defer together or the counts
  // would transiently mix old and new filter state.
  const deferredFilters = useDeferredValue(filters);
  const deferredOwnedFilter = useDeferredValue(ownedFilter);
  const deferredOwnedCountMin = useDeferredValue(ownedCountMin);
  const deferredOwnedCountMax = useDeferredValue(ownedCountMax);

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
  // Narrow the universe by owned BEFORE computing facet counts so the other
  // chips (sets, rarities, colors, etc.) reflect the active owned selection —
  // both the coarse buckets and the copies-owned range slider. Uses the
  // deferred inputs (see above): the counts belong to the deferred render.
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
  const filterCounts = computeFilterCounts(universeForCounts, deferredFilters, {
    countBy: view === "cards" ? "card" : "printing",
    keywordReverseMap,
    getPrice,
    customTagAssignments,
  });
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
  keywordReverseMap,
  channels,
  customTagAssignments,
}: UseCardDataParams) {
  "use memo";

  const { orders } = useEnumOrders();

  // Compose the filter-meta hook so callers that don't yet read directly
  // from useCatalogFilterMeta still get availableFilters/filterCounts/etc.
  // from useCardData's return. <CardCatalogFilterPanel> talks to
  // useCatalogFilterMeta directly so its re-renders aren't entangled with
  // the rest of useCardData's outputs.
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

  // getPrice resolves a printing's price on the user's favorite marketplace.
  // Filters, sorting, and the available-price-range histogram all read prices
  // through this dependency rather than reading a field off the printing.
  const lookup = prices ?? EMPTY_PRICE_LOOKUP;
  const getPrice = (p: Printing) => lookup.get(p.id, favoriteMarketplace);

  // `allPrintings` from useCards() arrives in (userLanguageRank, canonicalRank)
  // order, so `filterCards` preserves that order and the dedup/group below
  // can be first-occurrence without re-sorting.
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

  // Cards view collapses printings into one tile per card. When grouped by set
  // or rarity the tile is per (cardId, set) / (cardId, rarity) instead, so a
  // card reprinted across N sets (or printed at N rarities) shows up once under
  // each — each section reads as a complete index of the cards in it.
  const displayCards =
    view === "cards" ? dedupeToCardsViewTiles(filteredCards, groupBy) : filteredCards;

  const printingsByCardId = Map.groupBy(filteredCards, (p) => p.cardId);

  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, lookup, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (p) => {
      const range = priceRangeByCardId.get(p.cardId);
      if (!range) {
        return getPrice(p) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  } else if (sortBy === "price") {
    sortOptions.getPrice = getPrice;
  } else if (sortBy === "rarity") {
    sortOptions.rarityOrder = orders.rarities;
  }
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
