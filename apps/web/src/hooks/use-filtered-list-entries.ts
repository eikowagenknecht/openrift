import type { ListEntryDetailResponse } from "@openrift/shared";
import { filterCards } from "@openrift/shared";

import { collectListPrintings } from "@/components/list/list-entries";
import { useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { usePrices } from "@/hooks/use-prices";
import { useDisplayStore } from "@/stores/display-store";

export interface FilteredListEntries {
  /** True when the card-browser filters are narrowing the grid right now. */
  hasActiveFilters: boolean;
  /** The entries the grid is showing, in grid order. */
  filteredEntries: ListEntryDetailResponse[];
}

/**
 * The subset of a list's entries that survives the card-browser filters, for
 * consumers outside the grid (the export dialog).
 *
 * This mirrors `useListEntryBrowserData`'s browse-mode pipeline, minus the
 * parts that only matter for rendering: entries resolve to printings the same
 * way, then run through the same `filterCards` pass with the same price and
 * keyword inputs. Sorting, grouping and the cards-view dedupe are skipped —
 * they reshape the grid but never change which entries are in it. Owned
 * filters are skipped for the same reason browse mode skips them (the list
 * toolbar hides that section, and browse mode passes no owned-count map).
 *
 * Entries whose printing isn't in the catalog drop out, matching the grid.
 * @param entries - Every entry on the list, filtered or not.
 * @returns Whether filters are active, and the entries they leave.
 */
export function useFilteredListEntries(
  entries: readonly ListEntryDetailResponse[],
): FilteredListEntries {
  const { printingsById, printingsByCardId } = useCards();
  const { filters, hasActiveFilters } = useFilterValues();
  const keywordReverseMap = useKeywordReverseMap();
  const prices = usePrices();
  const favoriteMarketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");

  const { listPrintings, entriesByPrintingId } = collectListPrintings(
    entries,
    printingsById,
    printingsByCardId,
  );

  const kept = filterCards(listPrintings, filters, {
    keywordReverseMap,
    getPrice: (printing) => prices.get(printing.id, favoriteMarketplace),
  });

  return {
    hasActiveFilters,
    filteredEntries: kept.flatMap((printing) => entriesByPrintingId.get(printing.id) ?? []),
  };
}
