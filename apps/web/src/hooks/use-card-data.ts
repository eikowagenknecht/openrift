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

import type { SetInfo } from "@/components/cards/card-grid";
import { useEnumOrders } from "@/hooks/use-enums";
import { applyOwnedBucketFilter } from "@/lib/owned-bucket";
import type { OwnedBucket } from "@/lib/search-schemas";

interface UseCardDataParams {
  allPrintings: Printing[];
  sets: SetInfo[];
  filters: CardFilters;
  /** Selected ownership buckets. Empty array means no owned filter. */
  ownedFilter?: readonly OwnedBucket[];
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  /**
   * When grouping by set in cards view, the dedup is skipped so each set
   * section lists every printing released in that set. Defaults to "none".
   */
  groupBy?: GroupByField;
  ownedCountByPrinting: Record<string, number> | undefined;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  enabled?: boolean;
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
 * Build owned-count map keyed by printing ID. In "cards" view, the representative gets the sum.
 * @returns A map from printing ID to owned count.
 */
function buildOwnedCounts(
  allPrintings: Printing[],
  displayCards: Printing[],
  ownedCountByPrinting: Record<string, number>,
  view: "cards" | "printings",
): Map<string, number> {
  const map = new Map<string, number>();
  if (view === "cards") {
    const countByCard = new Map<string, number>();
    for (const p of allPrintings) {
      const count = ownedCountByPrinting[p.id] ?? 0;
      countByCard.set(p.cardId, (countByCard.get(p.cardId) ?? 0) + count);
    }
    for (const p of displayCards) {
      const count = countByCard.get(p.cardId) ?? 0;
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
  flags: { signed: 0, promo: 0, banned: 0, errata: 0 },
  ranges: {
    energy: { min: 0, max: 0, hasNullStat: false },
    might: { min: 0, max: 0, hasNullStat: false },
    power: { min: 0, max: 0, hasNullStat: false },
    price: { min: 0, max: 0 },
  },
};

/**
 * Keep the first printing encountered per `cardId`. Relies on the input
 * being pre-sorted in the order the caller wants to break ties in — here,
 * (userLanguageRank, canonicalRank) from useCards().
 *
 * @returns One printing per cardId, in first-occurrence order.
 */
function firstPrintingPerCard(printings: Printing[]): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    if (!seen.has(printing.cardId)) {
      seen.add(printing.cardId);
      result.push(printing);
    }
  }
  return result;
}

/**
 * Like {@link firstPrintingPerCard} but keys on `(cardId, setId)` so a card
 * reprinted in N sets gets one row per set. Used for cards-view + set-grouping
 * where each set section is meant to read as a complete index of the cards in
 * that set, with one tile per card.
 *
 * @returns One printing per (cardId, setId) pair, in first-occurrence order.
 */
function firstPrintingPerCardPerSet(printings: Printing[]): Printing[] {
  const seen = new Set<string>();
  const result: Printing[] = [];
  for (const printing of printings) {
    const key = `${printing.cardId}|${printing.setId}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(printing);
    }
  }
  return result;
}

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
  // chips (sets, rarities, colors, etc.) reflect the active owned selection.
  const universeForCounts =
    ownedFilter && ownedFilter.length > 0 && ownedCountByPrinting
      ? applyOwnedBucketFilter(
          allPrintings,
          ownedFilter,
          ownedCountByPrinting,
          view === "printings" ? "printing" : "card",
        )
      : allPrintings;
  const filterCounts = computeFilterCounts(universeForCounts, filters, {
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
  sortBy,
  sortDir,
  view,
  groupBy = "none",
  ownedCountByPrinting,
  favoriteMarketplace,
  prices,
  enabled = true,
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
    view,
    ownedCountByPrinting,
    favoriteMarketplace,
    prices,
    enabled,
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

  if (ownedFilter && ownedFilter.length > 0 && ownedCountByPrinting) {
    filteredCards = applyOwnedBucketFilter(
      filteredCards,
      ownedFilter,
      ownedCountByPrinting,
      view === "printings" ? "printing" : "card",
    );
  }

  // Cards view dedupes by cardId so each card gets one tile. When also grouped
  // by set, dedupe is per (cardId, setId) instead so a card reprinted in N
  // sets shows up once under each — each set section reads as a complete
  // index of the cards in that set.
  const displayCards =
    view === "cards"
      ? groupBy === "set"
        ? firstPrintingPerCardPerSet(filteredCards)
        : firstPrintingPerCard(filteredCards)
      : filteredCards;

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
    ? buildOwnedCounts(allPrintings, displayCards, ownedCountByPrinting, view)
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
