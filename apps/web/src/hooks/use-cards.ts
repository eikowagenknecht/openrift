import { sortByLanguageAndCanonicalRank } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { UseCardsResult } from "@/lib/catalog-query";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { useDisplayStore } from "@/stores/display-store";

// Re-export for consumers that import catalogQueryOptions from here
// (landing-page.tsx uses it for the totalCopies stat).
export { catalogQueryOptions } from "@/lib/catalog-query";

export function useCards(): UseCardsResult {
  // The catalog is admin-edited only and never mutated client-side, so we read
  // from the React Query-cached enriched result. `enrichCatalog` memoizes by
  // input identity (see catalog-query.ts), which is what makes `data` stable
  // across renders — React Query's default structural sharing can't preserve
  // identity here because the enriched shape contains a Map.
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const userLanguages = useDisplayStore((state) => state.languages);

  if (userLanguages.length === 0) {
    return data;
  }
  const sortedPrintings = sortByLanguageAndCanonicalRank(data.allPrintings, userLanguages);
  return {
    ...data,
    allPrintings: sortedPrintings,
    printingsByCardId: Map.groupBy(sortedPrintings, (p) => p.cardId),
  };
}
