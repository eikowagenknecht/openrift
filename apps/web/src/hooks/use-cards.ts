import type { Printing, CatalogResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import type { SetInfo } from "@/components/cards/card-grid";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { client } from "@/lib/rpc-client";

interface UseCardsResult {
  allCards: Printing[];
  setInfoList: SetInfo[];
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await client.api.v1.catalog.$get();
  if (!res.ok) {
    throw new ApiError(
      `Failed to fetch catalog: ${res.status}`,
      res.status,
      "CATALOG_FETCH_FAILED",
    );
  }
  return await res.json();
}

function enrichCatalog(catalog: CatalogResponse): UseCardsResult {
  const slugById = new Map(catalog.sets.map((s) => [s.id, s.slug]));
  const allCards: Printing[] = catalog.printings.map((p) => ({
    ...p,
    setSlug: slugById.get(p.setId) ?? "",
    card: catalog.cards[p.cardId],
  }));
  return { allCards, setInfoList: catalog.sets };
}

export const catalogQueryOptions = queryOptions({
  queryKey: queryKeys.catalog.all,
  queryFn: fetchCatalog,
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  select: enrichCatalog,
});

export function useCards(): UseCardsResult {
  const { data } = useSuspenseQuery(catalogQueryOptions);

  return data;
}
