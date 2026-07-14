import type {
  CardFilters,
  DistributionChannel,
  GroupByField,
  Marketplace,
  PriceLookup,
  Printing,
  SortCardsOptions,
  SortOption,
} from "@openrift/shared";
import {
  WellKnown,
  computeFilterCounts,
  filterCards,
  getAvailableFilters,
  sortByLanguageAndCanonicalRank,
  sortCards,
} from "@openrift/shared";

import type { SetInfo } from "@/components/cards/card-grid";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { useEnumOrders } from "@/hooks/use-enums";
import { useStackedCopies } from "@/hooks/use-stacked-copies";
import { dedupeToCardsViewTiles } from "@/lib/card-tiles";
import { applyOwnedBucketFilter, applyOwnedCountFilter, maxOwnedCount } from "@/lib/owned-bucket";
import type { OwnedBucket } from "@/lib/search-schemas";

interface UseCollectionCardDataParams {
  collectionId?: string;
  filters: CardFilters;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  view: "cards" | "printings";
  /** Cards-view grouping axis. Splits a card into per-set / per-rarity tiles. */
  groupBy: GroupByField;
  sets: SetInfo[];
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
  /** Reverse map from translated keyword labels to canonical names, for cross-language search. */
  keywordReverseMap?: Map<string, string>;
  languageOrder?: string[];
  /** Full channel registry so the filter UI can render breadcrumbs. */
  channels?: readonly DistributionChannel[];
  /**
   * Selected ownership buckets. Counts are scoped to this collection — so
   * "Full Playset" means a full playset's worth of copies inside _this_
   * collection, not aggregated across every collection the user owns. Empty
   * array means no owned filter.
   */
  ownedFilter?: readonly OwnedBucket[];
  /**
   * Copies-owned range slider, scoped to this collection's copy counts (same
   * scoping rationale as {@link ownedFilter}). null bounds mean unbounded.
   */
  ownedCountMin?: number | null;
  ownedCountMax?: number | null;
  /**
   * When set, the Owned bucket and Copies-range filters (and the slider bound)
   * are computed from THIS per-CARD personal total instead of the collection's
   * own copy counts. Keyed by cardId, each value is the viewer's full personal
   * playset for that card across EVERY variant they own (all finishes and
   * languages), not just the variants this box happens to stock. Used for
   * group-owned "bulk box" collections, where the viewer wants "cards here I
   * personally lack a playset of" — their personal shortfall — rather than "a
   * full playset inside this box".
   *
   * Card-keyed (not printing-keyed) on purpose: a full playset is a card-level
   * notion, so a box that stocks only one variant must still count the viewer's
   * copies of the card's OTHER variants. Undefined keeps the default
   * collection-scoped behavior, which is what a viewer's own personal
   * collection wants.
   */
  ownedCardTotalOverride?: Record<string, number>;
}

/**
 * Bridges useStackedCopies with the shared filter/sort pipeline so that collection
 * cards can be filtered, sorted, and displayed using the same infrastructure as the
 * full catalog browser.
 * @returns Filtered/sorted collection data plus stack metadata.
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
}: UseCollectionCardDataParams) {
  "use memo";
  const { stacks, totalCopies, isReady } = useStackedCopies(collectionId);
  const { orders } = useEnumOrders();
  const defaultEffectiveLanguageOrder = useEffectiveLanguageOrder();

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

  // Derived from the user's actual owned printings so the filter UI lists only
  // languages present in this collection. When the user owns a single
  // language, the Language section stays hidden (filter-panel threshold is
  // length > 1).
  const availableLanguages = [...new Set(collectionPrintings.map((p) => p.language))];

  // `useStackedCopies` returns printings in shortCode order (for the Copies
  // view). Pre-sort by (languageRank, canonicalRank) here so dedup/group
  // below can be first-occurrence and still pick the user-preferred printing
  // per card.
  const canonicallyOrderedCollection = sortByLanguageAndCanonicalRank(
    collectionPrintings,
    effectiveLanguageOrder,
  );
  let filteredCards = filterCards(canonicallyOrderedCollection, filters, {
    keywordReverseMap,
    getPrice,
  });

  // Both owned filters use per-collection copy counts (one entry per stack)
  // rather than the global owned-count map. In a single-collection view "Full
  // Playset" is most naturally read as "this collection has a full playset"; on
  // the all-collections view, `stacks` already aggregates every collection so
  // the same map gives the global count for free.
  const countByPrintingId: Record<string, number> = {};
  for (const stack of stacks) {
    countByPrintingId[stack.printingId] = stack.copyIds.length;
  }
  // `ownedCardTotalOverride` (per-card personal totals on a group "bulk box")
  // wins; otherwise the Owned/Copies filters read this collection's own copy
  // counts. The override is card-level, so assign each box printing its card's
  // full personal playset and bucket per-printing: card-mode aggregation would
  // sum the box's printings of a card (double-counting a card the box stocks in
  // several variants, and under-counting a card whose playset the viewer owns
  // as variants the box doesn't stock). Per-printing over card totals gives
  // every printing of a card the same verdict, which is the card verdict.
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
  // Apply the owned-bucket narrowing first so the Copies slider bound can be
  // faceted against every OTHER active filter (search, sets, the owned bucket)
  // but never against its own range.
  if (ownedFilter && ownedFilter.length > 0) {
    filteredCards = applyOwnedBucketFilter(
      filteredCards,
      ownedFilter,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  // Slider track upper bound — the most copies owned of any one card among the
  // cards surviving every other filter, measured with the same map the filters
  // use. Computed post-bucket / pre-copies-range so that e.g. "Partial Playset"
  // narrows the track (to the largest partial total) instead of leaving the
  // collection's full max, matching how the price/stat sliders facet.
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

  // Faceted counts for the OTHER filter dimensions (sets, rarities, colors, …).
  // Narrow the counting universe by the owned filters — the coarse bucket and
  // the copies-owned range — before handing it to computeFilterCounts, which
  // then does leave-one-out over the remaining dimensions. Mirrors
  // useCatalogFilterMeta so the collection grid's chips narrow as the user
  // filters. Custom tags are hidden on this surface, so none are threaded.
  let universeForCounts = collectionPrintings;
  if (ownedFilter && ownedFilter.length > 0) {
    universeForCounts = applyOwnedBucketFilter(
      universeForCounts,
      ownedFilter,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  if ((ownedCountMin ?? null) !== null || (ownedCountMax ?? null) !== null) {
    universeForCounts = applyOwnedCountFilter(
      universeForCounts,
      ownedCountMin ?? null,
      ownedCountMax ?? null,
      ownedFilterCounts,
      ownedFilterBucketBy,
    );
  }
  const filterCounts = computeFilterCounts(universeForCounts, filters, {
    countBy: view === "cards" ? "card" : "printing",
    keywordReverseMap,
    getPrice,
  });

  // In "cards" view, collapse to one tile per card — or per (cardId, set) /
  // (cardId, rarity) when grouped by set/rarity, so a card owned in N sets shows
  // up once under each (matching the catalog). The first printing seen per tile
  // (canonical pick) represents it.
  const displayCards =
    view === "cards" ? dedupeToCardsViewTiles(filteredCards, groupBy) : filteredCards;

  // Group all collection printings by cardId for detail pane siblings.
  const printingsByCardId = Map.groupBy(canonicallyOrderedCollection, (p) => p.cardId);

  // Price ranges for "cards" view sorting
  const priceRangeByCardId =
    view === "cards" ? computePriceRanges(printingsByCardId, prices, favoriteMarketplace) : null;

  const sortOptions: SortCardsOptions = { sortDir };
  if (sortBy === "price" && priceRangeByCardId) {
    sortOptions.getPrice = (printing) => {
      const range = priceRangeByCardId.get(printing.cardId);
      if (!range) {
        return getPrice(printing) ?? null;
      }
      return sortDir === "desc" ? range.max : range.min;
    };
  } else if (sortBy === "price") {
    sortOptions.getPrice = getPrice;
  } else if (sortBy === "rarity") {
    sortOptions.rarityOrder = orders.rarities;
  }
  const sortedCards = sortCards(displayCards, sortBy, sortOptions);

  // Build stack lookup for renderCard to find copyIds/counts
  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));

  // Copy IDs of every printing that survives the filters. "Select all" must
  // operate on this set, not on `stacks` (which ignores the active filters) and
  // not on `sortedCards` (which in cards view is deduped to one representative
  // printing per tile). A card owned across several printings collapses into a
  // single tile whose copies pool every printing's copies; selecting that tile
  // by hand already grabs them all, so "select all" has to as well. Flattening
  // the deduped list would leave the non-representative printings' copies out,
  // so "select all" then dispose would delete only some of each stack and leave
  // copies behind. `filteredCards` keeps every printing, so it matches.
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
    stackByPrintingId,
    totalUniqueCards,
    ownedCountMax: ownedCountUpperBound,
    setDisplayLabel,
    isReady,
  };
}

function computePriceRanges(
  printingsByCardId: Map<string, Printing[]>,
  prices: PriceLookup,
  marketplace: Marketplace,
): Map<string, { min: number; max: number }> {
  const map = new Map<string, { min: number; max: number }>();
  for (const [cardId, printings] of printingsByCardId) {
    let min = Infinity;
    let max = -Infinity;
    for (const printing of printings) {
      const price = prices.get(printing.id, marketplace);
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
