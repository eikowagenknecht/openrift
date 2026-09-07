import type {
  GroupByField,
  Marketplace,
  PriceLookup,
  Printing,
  SortDirection,
  SortOption,
} from "@openrift/shared";
import { useDeferredValue, useEffect, useState } from "react";

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
import type { GroupInfo } from "@/lib/card-group-types";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { maxOwnedCount } from "@/lib/owned-bucket";

interface UseCollectionGridDataParams {
  collectionId?: string;
  filters: ReturnType<typeof useFilterValues>["filters"];
  sortBy: SortOption;
  sortDir: SortDirection;
  view: "cards" | "printings" | "copies";
  groupBy: GroupByField;
  showLibrary: boolean;
  /** Inert outside a group bulk box, which is the only place the toggle shows. */
  wantedOnly: boolean;
  allPrintings: Printing[];
  sets: GroupInfo[];
  catalogAllPrintingsByCardId: Map<string, Printing[]>;
  favoriteMarketplace: Marketplace;
  prices: PriceLookup;
}

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
  const countsVisible = useFilterCountsVisible();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const languageFilter = filters.languages;

  // "copies" is a collection-only UI concept — at the data level it behaves like "printings"
  const dataView = view === "copies" ? "printings" : view;

  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;

  // A group bulk box has no personal owner, so the Owned/Copies filter measures
  // the viewer's personal playset shortfall summed across every variant they
  // own, not the box's own stock.
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

  // The wants endpoint is group-scoped; resolve the slug from the groups list.
  const groupId = currentCollection?.groupId ?? undefined;
  const { data: groupsData } = useFriendGroupsList(isGroupCollection);
  const groupSlug = groupId
    ? groupsData?.items.find((group) => group.id === groupId)?.slug
    : undefined;
  const boxWants = useGroupBoxWants(groupSlug);

  const tileGroupBy: GroupByField = dataView === "cards" && !showLibrary ? groupBy : "none";

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
    // Applied whenever this is a group box, not only once an owned filter is
    // active, or the Copies slider max flips basis on the first interaction.
    ownedCardTotalOverride: isGroupCollection ? personalCardTotals : undefined,
    countsEnabled: countsVisible,
  });

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
    // Not threading groupBy: the cell renderer assumes one cell per cardId
    // for sibling/variant logic.
    //
    // Passing ownedCountByPrinting unconditionally would bust this hook's
    // memo on every +/- and force every visible cell to re-render.
    ownedCountByPrinting: ownedFilterActive ? ownedCountByPrinting : undefined,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    favoriteMarketplace,
    prices,
    metaEnabled: showLibrary,
    countsEnabled: countsVisible,
    keywordReverseMap,
    channels,
  });

  const availableFilters = showLibrary ? catalogAvailableFilters : collectionAvailableFilters;
  const availableLanguages = showLibrary ? catalogAvailableLanguages : collectionAvailableLanguages;
  const filterCounts = showLibrary ? catalogFilterCounts : collectionFilterCounts;
  const activeSortedCards = showLibrary ? catalogSortedCards : collectionSortedCards;
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
  // The detail-pane picker lists every printing of the clicked card regardless
  // of the grid's other filters, scoped only by language.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );
  const totalUniqueCards = showLibrary ? catalogTotalUniqueCards : collectionTotalUniqueCards;
  const setDisplayLabel = showLibrary ? catalogSetDisplayLabel : collectionSetDisplayLabel;
  const ownedCountBound = showLibrary
    ? maxOwnedCount(
        allPrintings,
        ownedCountByPrinting ?? {},
        dataView === "printings" ? "printing" : "card",
      )
    : collectionOwnedCountMax;

  const deferredSortedCards = useDeferredValue(sortedCards);
  // 150ms debounce: without it, the grid flashes grayed out on every +/- click.
  const stalePending = deferredSortedCards !== sortedCards;
  const [isGridStale, setIsGridStale] = useState(false);
  if (!stalePending && isGridStale) {
    setIsGridStale(false);
  }
  useEffect(() => {
    if (!stalePending) {
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
