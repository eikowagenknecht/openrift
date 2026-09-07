import type {
  CardFilters,
  DistributionChannel,
  GroupByField,
  Marketplace,
  PriceLookup,
  Printing,
  SortOption,
} from "@openrift/shared";
import {
  EMPTY_CARD_FILTERS,
  WellKnown,
  computeFilterCounts,
  filterCards,
  getAvailableFilters,
  sortByLanguageAndCanonicalRank,
  sortCards,
} from "@openrift/shared";
import { useDeferredValue } from "react";

import type { GroupInfo } from "@/components/cards/card-grid-types";
import { EMPTY_FILTER_COUNTS } from "@/hooks/use-card-data";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders } from "@/hooks/use-enums";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { buildSortCardsOptions, computePriceRanges } from "@/lib/card-price-sort";
import { dedupeToCardsViewTiles } from "@/lib/card-tiles";
import { applyOwnedBucketFilter, applyOwnedCountFilter, maxOwnedCount } from "@/lib/owned-bucket";
import type { OwnedBucket } from "@/lib/search-schemas";

interface UseCollectionCardDataParams {
  collectionId?: string;
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  groupBy: GroupByField;
  sets: GroupInfo[];
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  keywordReverseMap?: Map<string, string>;
  languageOrder?: string[];
  channels?: readonly DistributionChannel[];
  /** Counts are scoped to this collection, not aggregated across every collection the user owns. */
  ownedFilter?: readonly OwnedBucket[];
  ownedCountMin?: number | null;
  ownedCountMax?: number | null;
  /**
   * Per-cardId personal playset total across every variant the viewer owns,
   * used for group-owned "bulk box" collections in place of this collection's
   * own copy counts. Card-keyed because a full playset is a card-level notion.
   */
  ownedCardTotalOverride?: Record<string, number>;
  countsEnabled?: boolean;
}

/**
 * Bridges useStackedCopies with the shared filter/sort pipeline so collection
 * cards can be filtered, sorted, and displayed with the same infrastructure as
 * the full catalog browser.
 */
export function useCollectionCardData({
  collectionId,
  filters,
  sortBy,
  sortDir,
  view,
  groupBy,
  sets,
  favoriteMarketplace,
  prices,
  keywordReverseMap,
  languageOrder,
  channels,
  ownedFilter,
  ownedCountMin,
  ownedCountMax,
  ownedCardTotalOverride,
  countsEnabled = true,
}: UseCollectionCardDataParams) {
  "use memo";
  const { stacks, totalCopies, collectionIdByCopyId, isReady } = useStackedCopies(collectionId);
  const { orders } = useEnumOrders();
  const defaultEffectiveLanguageOrder = useEffectiveLanguageOrder();

  // Deferred inputs for the facet counts only, so a filter change doesn't
  // block the grid; pinned to constants when counts are disabled entirely.
  const deferredFilters = useDeferredValue(countsEnabled ? filters : EMPTY_CARD_FILTERS);
  const deferredOwnedFilter = useDeferredValue(countsEnabled ? ownedFilter : undefined);
  const deferredOwnedCountMin = useDeferredValue(countsEnabled ? ownedCountMin : null);
  const deferredOwnedCountMax = useDeferredValue(countsEnabled ? ownedCountMax : null);

  const collectionPrintings = stacks.map((stack) => stack.printing);
  const setSlugToName = new Map(sets.map((set) => [set.slug, set.name]));
  const setDisplayLabel = (slug: string) => setSlugToName.get(slug) ?? slug;

  const getPrice = (p: Printing) => prices.get(p.id, favoriteMarketplace);

  // `languageOrder` prop wins (collection UIs can narrow further); otherwise
  // fall back to the user's display-store pref, otherwise the DB default.
  const effectiveLanguageOrder =
    languageOrder && languageOrder.length > 0 ? languageOrder : defaultEffectiveLanguageOrder;

  const availableFilters = getAvailableFilters(collectionPrintings, {
    orders,
    getPrice,
    channels,
  });
  availableFilters.supplementalSets = new Set(
    sets.filter((s) => s.setType === WellKnown.setType.SUPPLEMENTAL).map((s) => s.slug),
  );

  // Unioned with the active language filter (not just owned printings): a
  // collection holding only non-preferred languages would otherwise filter to
  // an empty grid with the Language control hidden behind its length > 1 gate.
  const availableLanguages = [
    ...new Set([
      ...collectionPrintings.map((p) => p.language),
      ...filters.languages,
      ...filters.languagesExclude,
    ]),
  ];

  // Pre-sort by (languageRank, canonicalRank) so the dedup/group below can be
  // first-occurrence and still pick the user-preferred printing per card.
  const canonicallyOrderedCollection = sortByLanguageAndCanonicalRank(
    collectionPrintings,
    effectiveLanguageOrder,
  );
  let filteredCards = filterCards(canonicallyOrderedCollection, filters, {
    keywordReverseMap,
    getPrice,
  });

  const countByPrintingId: Record<string, number> = {};
  for (const stack of stacks) {
    countByPrintingId[stack.printingId] = stack.copyIds.length;
  }
  // `ownedCardTotalOverride` assigns each box printing its card's full personal
  // playset and buckets per-printing, so a card stocked in several variants
  // isn't double-counted by card-mode aggregation.
  let ownedFilterCounts: Record<string, number>;
  let ownedFilterBucketBy: "card" | "printing";
  if (ownedCardTotalOverride) {
    ownedFilterCounts = {};
    for (const printing of collectionPrintings) {
      ownedFilterCounts[printing.id] = ownedCardTotalOverride[printing.cardId] ?? 0;
    }
    ownedFilterBucketBy = "printing";
  } else {
    ownedFilterCounts = countByPrintingId;
    ownedFilterBucketBy = "card";
  }
  // Owned-bucket narrowing must run before the Copies slider bound below.
  if (ownedFilter && ownedFilter.length > 0) {
    filteredCards = applyOwnedBucketFilter(
      filteredCards,
      ownedFilter,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  const ownedCountUpperBound = maxOwnedCount(filteredCards, ownedFilterCounts, ownedFilterBucketBy);
  if ((ownedCountMin ?? null) !== null || (ownedCountMax ?? null) !== null) {
    filteredCards = applyOwnedCountFilter(
      filteredCards,
      ownedCountMin ?? null,
      ownedCountMax ?? null,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }

  // Narrow the counting universe by the owned filters before computeFilterCounts
  // does leave-one-out over the remaining dimensions.
  let universeForCounts = collectionPrintings;
  if (deferredOwnedFilter && deferredOwnedFilter.length > 0) {
    universeForCounts = applyOwnedBucketFilter(
      universeForCounts,
      deferredOwnedFilter,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  if ((deferredOwnedCountMin ?? null) !== null || (deferredOwnedCountMax ?? null) !== null) {
    universeForCounts = applyOwnedCountFilter(
      universeForCounts,
      deferredOwnedCountMin ?? null,
      deferredOwnedCountMax ?? null,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  const filterCounts = countsEnabled
    ? computeFilterCounts(universeForCounts, deferredFilters, {
        countBy: view === "cards" ? "card" : "printing",
        keywordReverseMap,
        getPrice,
      })
    : EMPTY_FILTER_COUNTS;

  const displayCards =
    view === "cards" ? dedupeToCardsViewTiles(filteredCards, groupBy) : filteredCards;

  const printingsByCardId = Map.groupBy(canonicallyOrderedCollection, (p) => p.cardId);

  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, prices, favoriteMarketplace) : null;

  const sortOptions = buildSortCardsOptions({
    sortBy,
    sortDir,
    sets,
    getPrice,
    rarityOrder: orders.rarities,
    priceRangeByCardId,
  });
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));

  // Must come from `filteredCards`, not `sortedCards`: cards view dedupes to
  // one representative printing per tile, but selecting a tile grabs every
  // printing's copies, so "select all" needs every printing too.
  const selectableCopyIds = filteredCards.flatMap(
    (printing) => stackByPrintingId.get(printing.id)?.copyIds ?? [],
  );

  const totalUniqueCards =
    view === "cards"
      ? new Set(collectionPrintings.map((p) => p.cardId)).size
      : collectionPrintings.length;

  return {
    availableFilters,
    availableLanguages,
    filterCounts,
    sortedCards,
    selectableCopyIds,
    printingsByCardId,
    priceRangeByCardId,
    stacks,
    totalCopies,
    collectionIdByCopyId,
    stackByPrintingId,
    totalUniqueCards,
    ownedCountMax: ownedCountUpperBound,
    setDisplayLabel,
    isReady,
  };
}
