import type { Card, Printing, CatalogResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { SetInfo } from "@/components/cards/card-grid";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { API_URL } from "@/lib/server-fns/api-url";

interface UseCardsResult {
  allPrintings: Printing[];
  cardsById: Record<string, Card>;
  printingsById: Record<string, Printing>;
  printingsByCardId: Map<string, Printing[]>;
  setOrderMap: Map<string, number>;
  sets: SetInfo[];
  totalCopies: number;
}

const fetchCatalog = createServerFn({ method: "GET" }).handler(
  (): Promise<CatalogResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "catalog"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/catalog`);
        if (!res.ok) {
          throw new Error(`Catalog fetch failed: ${res.status}`);
        }
        return res.json() as Promise<CatalogResponse>;
      },
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
  const slugById = new Map(catalog.sets.map((s) => [s.id, s.slug]));

  // Cards are already in the right shape — identity lives in the map key.
  const cardsById: Record<string, Card> = catalog.cards;

  // Join printings with their card and the parent set slug. The printing id
  // is restored on the object so consumers that iterate `allPrintings` (a
  // flat array without surrounding keys) still have an identifier.
  const allPrintings: Printing[] = [];
  const printingsById: Record<string, Printing> = {};
  for (const [id, value] of Object.entries(catalog.printings)) {
    const setSlug = slugById.get(value.setId);
    const card = cardsById[value.cardId];
    if (setSlug && card) {
      const printing: Printing = { ...value, id, setSlug, card };
      allPrintings.push(printing);
      printingsById[id] = printing;
    }
  }

  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.cardId);
  const setOrderMap = new Map(catalog.sets.map((s, i) => [s.id, i]));

  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
    setOrderMap,
    sets: catalog.sets,
    totalCopies: catalog.totalCopies,
  };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: () => (globalThis.window === undefined ? fetchCatalog() : fetchCatalogFromEdge()),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
});

export function useCards(): UseCardsResult {
  const { data } = useSuspenseQuery(catalogQueryOptions);

  return data;
}
