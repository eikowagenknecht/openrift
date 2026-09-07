import type { ListEntryDetailResponse, ListKind } from "@openrift/shared/types/api/list";
import { useEffect } from "react";

import { useCardData } from "@/features/cards/hooks/use-card-data";
import { useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
import { useCards } from "@/features/cards/hooks/use-cards";
import { filterPrintingsByLanguages } from "@/features/cards/lib/filter-printings-by-languages";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import {
  buildEntryByKey,
  buildItems,
  buildItemsFromCatalog,
  collectListPrintings,
  kindToView,
} from "@/features/lists/lib/list-entries";
import { useListEntriesStore } from "@/features/lists/stores/list-entries-store";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useSession } from "@/lib/auth-session";
import { useDisplayStore } from "@/stores/display-store";

export interface UseListEntryBrowserDataParams {
  kind: ListKind;
  entries: ListEntryDetailResponse[];
  showLibrary: boolean;
}

export function useListEntryBrowserData({
  kind,
  entries,
  showLibrary,
}: UseListEntryBrowserDataParams) {
  const { allPrintings, printingsById, printingsByCardId, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();

  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  const { filters, sortBy, sortDir, groupBy, groupDir, hasActiveFilters } = useFilterValues();
  const view: "cards" | "printings" | "copies" = kindToView(kind);
  // useCardData and CardCell only support "cards" | "printings"; "copies" expands per-entry below.
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  const {
    sortedCards: listSortedCards,
    printingsByCardId: listPrintingsByCardId,
    priceRangeByCardId: listPriceRangeByCardId,
    availableFilters: listAvailableFilters,
    availableLanguages: listAvailableLanguages,
    filterCounts: listFilterCounts,
    setDisplayLabel: listSetDisplayLabel,
    totalUniqueCards: listTotalUniqueCards,
    filteredCount: listFilteredCount,
  } = useCardData({
    allPrintings: listPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    metaEnabled: !showLibrary,
    keywordReverseMap,
    channels,
  });

  // Computed unconditionally (not gated on showLibrary) so useCardData's memoization keeps toggling cheap.
  const {
    sortedCards: catalogSortedCards,
    printingsByCardId: catalogPrintingsByCardId,
    priceRangeByCardId: catalogPriceRangeByCardId,
    availableFilters: catalogAvailableFilters,
    availableLanguages: catalogAvailableLanguages,
    filterCounts: catalogFilterCounts,
    setDisplayLabel: catalogSetDisplayLabel,
    totalUniqueCards: catalogTotalUniqueCards,
    filteredCount: catalogFilteredCount,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view: dataView,
    groupBy,
    // Threaded only when the owned-bucket filter is active: otherwise the global map
    // mutates on every +/- and invalidates this hook's memoization every entry mutation.
    ownedCountByPrinting: filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    metaEnabled: showLibrary,
    keywordReverseMap,
    channels,
  });

  const sortedCards = showLibrary ? catalogSortedCards : listSortedCards;
  const filteredPrintingsByCardId = showLibrary ? catalogPrintingsByCardId : listPrintingsByCardId;
  const priceRangeByCardId = showLibrary ? catalogPriceRangeByCardId : listPriceRangeByCardId;
  const availableFilters = showLibrary ? catalogAvailableFilters : listAvailableFilters;
  const availableLanguages = showLibrary ? catalogAvailableLanguages : listAvailableLanguages;
  const filterCounts = showLibrary ? catalogFilterCounts : listFilterCounts;
  const setDisplayLabel = showLibrary ? catalogSetDisplayLabel : listSetDisplayLabel;
  const totalUniqueCards = showLibrary ? catalogTotalUniqueCards : listTotalUniqueCards;
  const filteredCount = showLibrary ? catalogFilteredCount : listFilteredCount;

  const userLanguages = useDisplayStore((state) => state.languages);
  const userScopedPrintingsByCardId = filterPrintingsByLanguages(printingsByCardId, userLanguages);

  const { items, entryByItemId } = showLibrary
    ? buildItemsFromCatalog(sortedCards)
    : buildItems(view, sortedCards, entriesByPrintingId);

  const entryByKey = buildEntryByKey(kind, entries);

  // Effect deps are the recomputed maps directly: their identities stay stable across
  // renders when entries don't change, so cells can self-subscribe via the store.
  useEffect(() => {
    useListEntriesStore.getState().setEntries(entryByItemId, entryByKey);
  }, [entryByItemId, entryByKey]);

  return {
    allPrintings,
    sets,
    display,
    showImages,
    groupBy,
    groupDir,
    hasActiveFilters,
    view,
    dataView,
    listPrintings,
    entriesByPrintingId,
    filteredPrintingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
    userScopedPrintingsByCardId,
    items,
    entryByItemId,
    entryByKey,
  };
}
