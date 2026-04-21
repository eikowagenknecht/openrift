import type { Card, CatalogResponse, Printing } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { SetInfo } from "@/components/cards/card-grid";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

export interface UseCardsResult {
  allPrintings: Printing[];
  cardsById: Record<string, Card>;
  printingsById: Record<string, Printing>;
  printingsByCardId: Map<string, Printing[]>;
  sets: SetInfo[];
}

const fetchCatalog = createServerFn({ method: "GET" }).handler(
  (): Promise<CatalogResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "catalog"],
      queryFn: () =>
        fetchApiJson<CatalogResponse>({
          errorTitle: "Couldn't load catalog",
          path: "/api/v1/catalog",
        }),
    }),
);

// Client-side catalog fetch goes directly to /api/v1/catalog so Cloudflare
// can serve it from the edge cache. Routing through the Start server function
// would re-enter origin for every VU, which is exactly what we're avoiding.
async function fetchCatalogFromEdge(): Promise<CatalogResponse> {
  const res = await fetch("/api/v1/catalog");
  if (!res.ok) {
    throw new Error(`Catalog fetch failed: ${res.status}`);
  }
  return res.json() as Promise<CatalogResponse>;
}

function enrichCatalog(catalog: CatalogResponse): UseCardsResult {
  const setsById = new Map(catalog.sets.map((s) => [s.id, s]));

  // Cards are already in the right shape — identity lives in the map key.
  const cardsById: Record<string, Card> = catalog.cards;

  // Join printings with their card and the parent set slug. The printing id
  // is restored on the object so consumers that iterate `allPrintings` (a
  // flat array without surrounding keys) still have an identifier.
  //
  // `canonicalRank` rides through from the API — each row carries the
  // server-computed sort key from the `printings_ordered` view. Consumers
  // that need user-language-aware order layer on top via
  // `sortByLanguageAndCanonicalRank`.
  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const [id, value] of Object.entries(catalog.printings)) {
    const set = setsById.get(value.setId);
    const card = cardsById[value.cardId];
    if (set && card) {
      const printing: Printing = {
        ...value,
        id,
        setSlug: set.slug,
        setReleased: set.released,
        card,
      };
      allPrintings.push(printing);
      printingsById[id] = printing;
    }
  }

  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);

  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    sets: catalog.sets,
  };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: () => (globalThis.window === undefined ? fetchCatalog() : fetchCatalogFromEdge()),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
  // A catalog 500 means edge cache miss + origin failure — not the kind of
  // thing that self-heals in a few seconds. One quick retry covers transient
  // blips; beyond that, surface the error fallback instead of stalling on a
  // skeleton for the full exponential-backoff window.
  retry: 1,
  retryDelay: 500,
});
