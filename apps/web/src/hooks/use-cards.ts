import { sortByLanguageAndCanonicalRank } from "@openrift/shared";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { use } from "react";

import { CatalogSubsetContext } from "@/components/cards/catalog-subset-provider";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import type { UseCardsResult } from "@/lib/catalog-query";
import { catalogQueryOptions, loadCatalogTail, noCatalogQueryOptions } from "@/lib/catalog-query";
import { useDisplayStore } from "@/stores/display-store";

// Re-export for consumers that import catalogQueryOptions from here
// (landing-page.tsx uses it for the totalCopies stat).
export { catalogQueryOptions } from "@/lib/catalog-query";

/**
 * The catalogue this part of the tree reads: the page's own subset when a
 * `CatalogSubsetProvider` supplies one, the whole catalogue otherwise.
 * @returns The enriched catalogue.
 */
export function useCards(): UseCardsResult {
  return useCatalog(use(CatalogSubsetContext));
}

/**
 * The whole catalogue, for a consumer that has to resolve a card its page's
 * subset never names — the deck description's `[[Card Name]]` links. It
 * fetches, so mount it behind `useHydrated()` inside a Suspense boundary.
 * @returns The enriched catalogue.
 */
export function useFullCatalog(): UseCardsResult {
  return useCatalog(null);
}

function useCatalog(subset: UseCardsResult | null): UseCardsResult {
  // `queryOptions` bakes each literal query key into its own option type, so
  // the stand-in is unrelated to the real one even though the call takes either.
  const options =
    subset === null
      ? catalogQueryOptions
      : (noCatalogQueryOptions as unknown as typeof catalogQueryOptions);

  // The catalog is admin-edited only and never mutated client-side, so we read
  // from the React Query-cached enriched result. `enrichCatalog` memoizes by
  // input identity (see catalog-query.ts), which is what makes `data` stable
  // across renders — React Query's default structural sharing can't preserve
  // identity here because the enriched shape contains a Map.
  const { data } = useSuspenseQuery(options);
  const userLanguages = useDisplayStore((state) => state.languages);
  const queryClient = useQueryClient();

  // The client fetches the user's languages first (see catalog-query.ts);
  // pull the remaining languages in once the main thread is idle after first
  // paint. Re-runs whenever the catalog entry changes (a version refetch gets
  // a fresh tail); loadCatalogTail itself no-ops when nothing is missing.
  // requestIdleCallback is missing on iOS Safari, hence the timeout fallback.
  useScopeEffect(subset === null ? data : null, (scope) => {
    if (scope === null) {
      return;
    }
    const start = () => void loadCatalogTail(queryClient);
    if (typeof requestIdleCallback === "function") {
      const handle = requestIdleCallback(start, { timeout: 5000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(start, 1500);
    return () => clearTimeout(timer);
  });

  const catalog = subset ?? data;
  if (userLanguages.length === 0) {
    return catalog;
  }
  const sortedPrintings = sortByLanguageAndCanonicalRank(catalog.allPrintings, userLanguages);
  return {
    ...catalog,
    allPrintings: sortedPrintings,
    printingsByCardId: Map.groupBy(sortedPrintings, (p) => p.cardId),
  };
}
