import { sortByLanguageAndCanonicalRank } from "@openrift/shared/utils";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { use } from "react";

import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { CatalogSubsetContext } from "@/features/cards/hooks/catalog-subset-context";
import type { UseCardsResult } from "@/features/cards/lib/catalog-query";
import { loadCatalogTail, noCatalogQueryOptions } from "@/features/cards/lib/catalog-query";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { useDisplayStore } from "@/stores/display-store";

export { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";

export function useCards(): UseCardsResult {
  return useCatalog(use(CatalogSubsetContext));
}

/** Fetches; mount behind `useHydrated()` inside a Suspense boundary. */
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

  // React Query's structural sharing can't preserve identity for a shape
  // containing a Map; `enrichCatalog` memoizes by input identity instead.
  const { data } = useSuspenseQuery(options);
  const userLanguages = useDisplayStore((state) => state.languages);
  const queryClient = useQueryClient();

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
