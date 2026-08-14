import { sortByLanguageAndCanonicalRank } from "@openrift/shared";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import type { UseCardsResult } from "@/lib/catalog-query";
import { catalogQueryOptions, loadCatalogTail } from "@/lib/catalog-query";
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
  const queryClient = useQueryClient();

  // The client fetches the user's languages first (see catalog-query.ts);
  // pull the remaining languages in once the main thread is idle after first
  // paint. Re-runs whenever the catalog entry changes (a version refetch gets
  // a fresh tail); loadCatalogTail itself no-ops when nothing is missing.
  // requestIdleCallback is missing on iOS Safari, hence the timeout fallback.
  useEffect(() => {
    const start = () => void loadCatalogTail(queryClient);
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(start, { timeout: 5000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, 1500);
    return () => clearTimeout(timer);
  }, [data, queryClient]);

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
