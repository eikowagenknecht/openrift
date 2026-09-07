import { filterCards } from "@openrift/shared/filters";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";

import { useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useCards } from "@/features/cards/hooks/use-cards";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { collectListPrintings } from "@/features/lists/lib/list-entries";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useDisplayStore } from "@/stores/display-store";

export interface FilteredListEntries {
  hasActiveFilters: boolean;
  filteredEntries: ListEntryDetailResponse[];
}

/**
 * Mirrors `useListEntryBrowserData`'s browse-mode pipeline minus sorting,
 * grouping, and dedupe, which reshape the grid but don't change its membership.
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
