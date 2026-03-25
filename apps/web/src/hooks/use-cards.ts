import type { Printing, CatalogResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import type { SetInfo } from "@/components/cards/card-grid";
import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

interface UseCardsResult {
  allPrintings: Printing[];
  sets: SetInfo[];
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await client.api.v1.catalog.$get();
  assertOk(res);
  return await res.json();
}

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
  return { allPrintings, sets: catalog.sets };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: fetchCatalog,
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
  select: enrichCatalog,
});

export function useCards(): UseCardsResult {
  const { data } = useSuspenseQuery(catalogQueryOptions);

  return data;
}
