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

  // Re-add `id` to each card value so existing consumers can keep reading `.id`.
  const cardsById: Record<string, Card> = {};
  for (const [id, value] of Object.entries(catalog.cards)) {
    cardsById[id] = { ...value, id };
  }

  // Re-add `id` and join with card + setSlug to produce the enriched Printing shape.
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

  const printingsByCardId = Map.groupBy(allPrintings, (p) => p.card.id);

  return {
    allPrintings,
    cardsById,
    printingsById,
    printingsByCardId,
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
