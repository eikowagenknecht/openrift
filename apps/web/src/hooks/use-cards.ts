import { sortByLanguageAndCanonicalRank } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { useSyncedCatalog } from "@/lib/catalog-collection";
import type { UseCardsResult } from "@/lib/catalog-query";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { useDisplayStore } from "@/stores/display-store";

export function useCards(): UseCardsResult {
  // Two catalog sources, evaluated in a fixed hook order:
  //  - the synced on-device catalog (ADR-027): present once the 15 public
  //    shapes have finished their initial sync, then served instantly on every
  //    return visit and updated in the background when cards change. Null on
  //    the server, pre-hydration, while persistence/sync settle, and in
  //    OPFS-less browsers.
  //  - the edge-fetch path: the SSR loader prefetches it, so it is the
  //    byte-equivalent fallback that keeps first paint and crawlers unchanged.
  //
  // The suspense query is always subscribed (stable hooks, and it is what the
  // shell suspends on for the very first load). When the synced catalog is
  // ready it wins; both produce the same `UseCardsResult` shape.
  const synced = useSyncedCatalog();
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const userLanguages = useDisplayStore((state) => state.languages);

  // `enrichCatalog` (both paths) memoizes by input identity, which is what
  // keeps the result stable across renders — React Query's default structural
  // sharing can't preserve identity here because the enriched shape contains a
  // Map.
  const result = synced ?? data;

  if (userLanguages.length === 0) {
    return result;
  }
  const sortedPrintings = sortByLanguageAndCanonicalRank(result.allPrintings, userLanguages);
  return {
    ...result,
    allPrintings: sortedPrintings,
    printingsByCardId: Map.groupBy(sortedPrintings, (p) => p.cardId),
  };
}
