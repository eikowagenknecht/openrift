import type {
  GroupByField,
  Marketplace,
  PriceLookup,
  Printing,
  SortDirection,
  SortOption,
} from "@openrift/shared";
import { useDeferredValue, useEffect, useState } from "react";

import type { SetInfo } from "@/components/cards/card-grid";
import { useCardData } from "@/hooks/use-card-data";
import type { useFilterValues } from "@/hooks/use-card-filters";
import { useCollectionCardData } from "@/hooks/use-collection-card-data";
import { useCollectionsMap } from "@/hooks/use-collections";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useFilterCountsVisible } from "@/hooks/use-filter-counts-visible";
import { useFriendGroupsList, useGroupBoxWants } from "@/hooks/use-friend-groups";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { maxOwnedCount } from "@/lib/owned-bucket";

interface UseCollectionGridDataParams {
  collectionId?: string;
  /** The `filters` object from useFilterValues() — a superset of the shared
   * CardFilters shape with web-only fields (ownedFilter, ownedCountMin/Max). */
  filters: ReturnType<typeof useFilterValues>["filters"];
  sortBy: SortOption;
  sortDir: SortDirection;
  view: "cards" | "printings" | "copies";
  groupBy: GroupByField;
  /** Whether the "show whole library" toggle is active — widens the grid from
   * "cards in this collection" to "every card in the catalog". */
  showLibrary: boolean;
  /** Whether the group-box "Wanted" toggle is active (`?wanted` on the route).
   * Inert outside a group bulk box, which is the only place the toggle shows. */
  wantedOnly: boolean;
  allPrintings: Printing[];
  sets: SetInfo[];
  /** The full catalog's printingsByCardId (from useCards()), unfiltered by
   * collection membership — used for sibling lookups and the detail pane. */
  catalogAllPrintingsByCardId: Map<string, Printing[]>;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
}

/**
 * Bundles the collection grid's full data pipeline: the collection-scoped and
 * catalog-scoped card data hooks, the show-library active-set selection
 * between them, the group-collection personal-shortfall override, the tile
 * grouping axis, and the deferred/stale-render bookkeeping for the grid.
 * @returns Everything the rest of CollectionGrid consumes from this pipeline.
 */
export function useCollectionGridData({
  collectionId,
  filters,
  sortBy,
  sortDir,
  view,
  groupBy,
  showLibrary,
  wantedOnly,
  allPrintings,
  sets,
  catalogAllPrintingsByCardId,
  favoriteMarketplace,
  prices,
}: UseCollectionGridDataParams) {
  const collectionsMap = useCollectionsMap();
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  // On phones the faceted counts only show inside the options drawer; skip
  // the counts pass while it's closed (see useFilterCountsVisible).
  const countsVisible = useFilterCountsVisible();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const languageFilter = filters.languages;

  // "copies" is a collection-only UI concept — at the data level it behaves like "printings"
  const dataView = view === "copies" ? "printings" : view;

  // An owned filter is "active" when either the buckets dropdown or the
  // copies-owned range is set — used to gate the global owned-count map into
  // the catalog/library hook (see its memo note below).
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;

  // A group-owned "bulk box" has no personal owner; every copy belongs to the
  // group. There the Owned/Copies filter should measure the viewer's PERSONAL
  // shortfall ("cards here I don't own a playset of yet"), not the box's own
  // stock. A full playset is a card-level notion, so we feed the collection
  // hook the viewer's personal total per card summed across EVERY variant they
  // own — a box that stocks only the normal printing must still count the
  // viewer's foil copies, or a card they already have a full playset of would
  // bucket as "partial". `ownedCountByPrinting` already excludes group copies;
  // `allPrintings` supplies each card's full sibling set. A viewer's own
  // personal collection keeps the default collection-scoped counts.
  const currentCollection = collectionId ? collectionsMap.get(collectionId) : undefined;
  const isGroupCollection = Boolean(currentCollection?.groupId);
  const personalCardTotals: Record<string, number> = {};
  if (isGroupCollection && ownedCountByPrinting) {
    for (const printing of allPrintings) {
      const owned = ownedCountByPrinting[printing.id];
      if (owned) {
        personalCardTotals[printing.cardId] = (personalCardTotals[printing.cardId] ?? 0) + owned;
      }
    }
  }

  // A group box can also be narrowed to what the viewer's wish lists still
  // want. The endpoint is group-scoped while this surface only knows the
  // collection's `groupId`, so resolve the slug from the viewer's groups list;
  // both queries stand down on a personal collection.
  const groupId = currentCollection?.groupId ?? undefined;
  const { data: groupsData } = useFriendGroupsList(isGroupCollection);
  const groupSlug = groupId
    ? groupsData?.items.find((group) => group.id === groupId)?.slug
    : undefined;
  const boxWants = useGroupBoxWants(groupSlug);

  // The tile axis for per-card aggregation (counts, copy selection, siblings).
  // Only the collection's own cards-view grid splits a card into per-set /
  // per-rarity tiles; the library overlay keeps the catalog's one-tile-per-card
  // layout (its useCardData call below deliberately stays ungrouped), so tiles
  // there collapse by cardId.
  const tileGroupBy: GroupByField = dataView === "cards" && !showLibrary ? groupBy : "none";

  // ── Collection data (browse/select modes) ───────────────────────────
  const {
    availableFilters: collectionAvailableFilters,
    availableLanguages: collectionAvailableLanguages,
    filterCounts: collectionFilterCounts,
    sortedCards: collectionSortedCards,
    selectableCopyIds,
    printingsByCardId: collectionPrintingsByCardId,
    stacks,
    totalCopies,
    collectionIdByCopyId,
    stackByPrintingId,
    totalUniqueCards: collectionTotalUniqueCards,
    ownedCountMax: collectionOwnedCountMax,
    setDisplayLabel: collectionSetDisplayLabel,
    isReady: copiesReady,
  } = useCollectionCardData({
    collectionId,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    sets,
    favoriteMarketplace,
    prices,
    keywordReverseMap,
    languageOrder: languageFilter,
    channels,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    // Group bulk box → measure the viewer's personal shortfall, not box stock.
    // Applied whenever this is a group box (not only once an owned filter is
    // active) so the Copies basis stays personal-copies consistently — without
    // this the slider's max silently flipped from box stock to personal on the
    // first owned-filter interaction.
    ownedCardTotalOverride: isGroupCollection ? personalCardTotals : undefined,
    countsEnabled: countsVisible,
  });

  // ── Catalog data (drives "show library" view + the quick-add palette in
  //    every mode). The bucket filter uses global counts here because
  //    "Full Playset" against the full library is a global notion. The
  //    collection hook applies the per-collection version separately.
  const {
    availableFilters: catalogAvailableFilters,
    availableLanguages: catalogAvailableLanguages,
    filterCounts: catalogFilterCounts,
    sortedCards: catalogSortedCards,
    printingsByCardId: catalogPrintingsByCardId,
    priceRangeByCardId: catalogPriceRangeByCardId,
    totalUniqueCards: catalogTotalUniqueCards,
    setDisplayLabel: catalogSetDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    // Intentionally not threading groupBy: the cell renderer assumes one cell
    // per cardId for sibling/variant logic. Skipping the dedup here would
    // require a parallel pass over those branches; the /cards catalog browser
    // is the only consumer wired up so far.
    //
    // `ownedCountByPrinting` is only consumed by the owned filters (buckets +
    // copies range) — passing the map unconditionally would bust this hook's
    // memo on every +/- (the map is a fresh projection of the global copies set
    // on every copy mutation), which in turn rebuilds `printingsByCardId` /
    // `priceRangeByCardId` and forces every visible cell to re-render. Same
    // guard /cards uses.
    ownedCountByPrinting: ownedFilterActive ? ownedCountByPrinting : undefined,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    favoriteMarketplace,
    prices,
    // The catalog meta (availableFilters + faceted counts over ALL printings)
    // only feeds the filter chrome when the library view is shown — in
    // browse/select mode the collection hook's meta wins the ternaries below,
    // so don't pay the full-catalog counts pass on every filter change there.
    metaEnabled: showLibrary,
    countsEnabled: countsVisible,
    keywordReverseMap,
    channels,
  });

  // ── Pick active data set based on whether the library is shown ──────
  const availableFilters = showLibrary ? catalogAvailableFilters : collectionAvailableFilters;
  const availableLanguages = showLibrary ? catalogAvailableLanguages : collectionAvailableLanguages;
  // Faceted counts so every filter chip (and the price/stat sliders) narrows to
  // the subset matching the other active filters — including the Copies range.
  const filterCounts = showLibrary ? catalogFilterCounts : collectionFilterCounts;
  const activeSortedCards = showLibrary ? catalogSortedCards : collectionSortedCards;
  // "Wanted" narrows the grid to the printings this box can actually hand over.
  // The cards view collapses a card's variants into one tile whose
  // representative printing needn't be the wanted one, so it matches on the
  // card; every other view has one tile per printing and matches on that.
  const wantedBoxId = wantedOnly && isGroupCollection ? collectionId : undefined;
  const sortedCards = wantedBoxId
    ? activeSortedCards.filter((printing) =>
        dataView === "cards"
          ? boxWants.wantsCard(wantedBoxId, printing.cardId)
          : boxWants.fulfillable(wantedBoxId, printing.id) > 0,
      )
    : activeSortedCards;
  const printingsByCardId = showLibrary ? catalogPrintingsByCardId : collectionPrintingsByCardId;
  // The detail-pane picker lists every printing of the clicked card, not just
  // the ones shown in the grid (filtered by set/search/rarity, or narrowed to
  // the collection in browse mode). Scope only by the active language filter.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );
  const totalUniqueCards = showLibrary ? catalogTotalUniqueCards : collectionTotalUniqueCards;
  const setDisplayLabel = showLibrary ? catalogSetDisplayLabel : collectionSetDisplayLabel;
  // Copies slider bound. In the library view the bound is global (most copies
  // owned of any card across all collections); in browse/select it's the
  // per-collection max the collection hook already computed.
  const ownedCountBound = showLibrary
    ? maxOwnedCount(
        allPrintings,
        ownedCountByPrinting ?? {},
        dataView === "printings" ? "printing" : "card",
      )
    : collectionOwnedCountMax;

  // Defer the card grid re-render so filter UI responds immediately
  const deferredSortedCards = useDeferredValue(sortedCards);
  // Only surface the dimmed "stale" state if the deferred render is genuinely
  // slow. Adding or removing a single copy re-derives sortedCards but the
  // deferred value catches up within a frame; without this debounce the
  // grid briefly flashes grayed out on every +/- click.
  const stalePending = deferredSortedCards !== sortedCards;
  const [isGridStale, setIsGridStale] = useState(false);
  useEffect(() => {
    if (!stalePending) {
      setIsGridStale(false);
      return;
    }
    const timer = globalThis.setTimeout(() => setIsGridStale(true), 150);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [stalePending]);

  return {
    dataView,
    currentCollection,
    isGroupCollection,
    /** True while the grid is actually narrowed to the box's wanted printings. */
    wantedFilterActive: wantedBoxId !== undefined,
    tileGroupBy,
    availableFilters,
    availableLanguages,
    filterCounts,
    sortedCards,
    printingsByCardId,
    detailPanePrintingsByCardId,
    totalUniqueCards,
    setDisplayLabel,
    ownedCountBound,
    selectableCopyIds,
    stacks,
    totalCopies,
    collectionIdByCopyId,
    stackByPrintingId,
    copiesReady,
    catalogPrintingsByCardId,
    catalogPriceRangeByCardId,
    deferredSortedCards,
    isGridStale,
    ownedCountByPrinting,
  };
}
