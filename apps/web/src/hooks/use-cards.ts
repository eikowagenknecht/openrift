import type { Printing, CatalogResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import type { SetInfo } from "@/components/cards/card-grid";
import { queryKeys } from "@/lib/query-keys";
import { client } from "@/lib/rpc-client";

type HealthStatus = "db_unreachable" | "db_not_migrated" | "db_empty" | null;

export class ApiError extends Error {
  healthStatus: HealthStatus;

  constructor(message: string, healthStatus: HealthStatus = null) {
    super(message);
    this.name = "ApiError";
    this.healthStatus = healthStatus;
  }
}

interface UseCardsResult {
  allCards: Printing[];
  setInfoList: SetInfo[];
}

async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await client.api.health.$get();
    const data = (await res.json()) as { status: string };
    if (
      data.status === "db_unreachable" ||
      data.status === "db_not_migrated" ||
      data.status === "db_empty"
    ) {
      return data.status;
    }
  } catch {
    // Health endpoint itself is unreachable — no extra info to surface
  }
  return null;
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await client.api.v1.catalog.$get();
  if (!res.ok) {
    const healthStatus = await checkHealth();
    throw new ApiError(`Failed to fetch catalog: ${res.status}`, healthStatus);
  }
  return (await res.json()) as CatalogResponse;
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

  if (data.allCards.length === 0) {
    throw new ApiError("No cards available", "db_empty");
  }

  return data;
}
