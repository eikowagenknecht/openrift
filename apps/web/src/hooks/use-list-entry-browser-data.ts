import type { ListEntryDetailResponse, ListKind } from "@openrift/shared";
import { useEffect } from "react";

import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import {
  buildEntryByKey,
  buildItems,
  buildItemsFromCatalog,
  collectListPrintings,
  kindToView,
} from "@/components/list/list-entries";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { useDisplayStore } from "@/stores/display-store";
import { useListEntriesStore } from "@/stores/list-entries-store";

export interface UseListEntryBrowserDataParams {
  kind: ListKind;
  entries: ListEntryDetailResponse[];
  /** True when the library toggle is on (catalog mode). Never true for copy-kind lists. */
  showLibrary: boolean;
}

/**
 * Data pipeline for `ListEntryBrowser`: resolves list entries to printings,
 * runs the browse-mode (list-scoped) and add-mode (full catalog) `useCardData`
 * pipelines, merges them by `showLibrary`, and builds the grid items + per-
 * entry lookups the browser renders from.
 * @param params - The list kind, its entries, and whether library (catalog) mode is active.
 * @returns Flat object of every value the list entry browser's data layer produces.
 */
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
  // List surfaces lock the view to the list's kind — a card-kind list
  // displays as cards, printing-kind as printings, copy-kind as copies.
  // The filter toolbar hides the view-mode toggle entirely on these pages
  // so there's no way to land on a mismatched view.
  const view: "cards" | "printings" | "copies" = kindToView(kind);
  // useCardData and CardCell only know "cards" | "printings". The catalog
  // pipeline still operates on printings; we expand to one-per-entry below.
  const dataView: "cards" | "printings" = view === "copies" ? "printings" : view;

  // Resolve each entry to a printing for the catalog filter pipeline. Card-
  // targeted entries fall back to the card's first known printing. Entries we
  // can't resolve (printing missing from catalog) are dropped.
  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  // Browse-mode pipeline (scoped to entries on the list).
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
    // Browse mode hides the catalog-wide owned/customTags sections (see
    // LIST_HIDDEN_FILTER_SECTIONS), so the owned-count map wouldn't drive
    // any visible UI here.
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  // Add-mode pipeline (full catalog). Computed unconditionally so toggling the
  // mode is cheap — `useCardData` is memoized by its inputs.
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
    // Only thread the owned-count map when the owned-bucket filter is
    // actually active. Otherwise the global map mutates on every +/- and
    // invalidates this hook's "use memo" cache, rebuilding every cell's
    // siblings / priceRange refs on every entry mutation. Mirrors the
    // guards in /cards and /collections.
    ownedCountByPrinting: filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
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

  // User-scoped fan: for card-kind lists we want the fan + detail pane to
  // show every printing of the card *from the global catalog*, but limited
  // to the user's preferred languages so the user doesn't see foreign-
  // language reprints they aren't interested in. Falls back to the full
  // catalog map when the user has no language preference set.
  const userLanguages = useDisplayStore((state) => state.languages);
  const userScopedPrintingsByCardId = filterPrintingsByLanguages(printingsByCardId, userLanguages);

  // Items + per-tile entry lookup. Copies view expands one tile per entry so
  // the user sees every physical copy separately; other views collapse to one
  // tile per printing. Add mode iterates over the catalog (one tile per
  // printing) — no per-entry expansion since most catalog tiles have no entry.
  const { items, entryByItemId } = showLibrary
    ? buildItemsFromCatalog(sortedCards)
    : buildItems(view, sortedCards, entriesByPrintingId);

  // ── Entry lookup for library mode + quantity display ─────────────────
  // Keyed by cardId on card-kind lists and printingId on printing-kind lists.
  // Quantity comes straight from `entry.quantity`. Mutations write to the
  // query cache optimistically (see useBulkAddListEntries / useUpdateListEntry),
  // so rapid +/- clicks reflect immediately without a separate pending store.
  const entryByKey = buildEntryByKey(kind, entries);

  // Feed the per-cell entry store so cells can self-subscribe by key without
  // taking parent-derived maps as unstable props. Effect deps include the
  // recomputed maps directly — when entries don't change, the upstream maps'
  // identities are stable across renders.
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
