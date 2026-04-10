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

function enrichCatalog(catalog: CatalogResponse): UseCardsResult {
  const slugById = new Map(catalog.sets.map((s) => [s.id, s.slug]));
  const allPrintings: Printing[] = [];
  for (const p of catalog.printings) {
    const setSlug = slugById.get(p.setId);
    const card = catalog.cards[p.cardId];
    if (setSlug && card) {
      allPrintings.push({ ...p, setSlug, card });
    }
  }
  return {
    allPrintings,
    cardsById: catalog.cards,
    sets: catalog.sets,
    totalCopies: catalog.totalCopies,
  };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: () => fetchCatalog(),
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
});

export function useCards(): UseCardsResult {
  const { data } = useSuspenseQuery(catalogQueryOptions);

  return data;
}
