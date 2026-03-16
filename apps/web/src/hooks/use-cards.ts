import { hydrateCatalog } from "@openrift/shared";
import type { Printing, RiftboundCatalog } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

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
  isLoading: boolean;
  error: Error | null;
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

async function fetchCatalog(): Promise<RiftboundCatalog> {
  const res = await client.api.catalog.$get();
  if (!res.ok) {
    const healthStatus = await checkHealth();
    throw new ApiError(`Failed to fetch catalog: ${res.status}`, healthStatus);
  }
  return hydrateCatalog((await res.json()) as RiftboundCatalog);
}

export function useCards(): UseCardsResult {
  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog.all,
    queryFn: fetchCatalog,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isEmpty = catalogQuery.data !== undefined && catalogQuery.data.printings.length === 0;
  const isLoading = !isEmpty && catalogQuery.isLoading;
  const error = isEmpty ? new ApiError("No cards available", "db_empty") : catalogQuery.error;

  const catalog = catalogQuery.data;

  const allCards: Printing[] = catalog
    ? (() => {
        const slugById = new Map(catalog.sets.map((s) => [s.id, s.slug]));
        return catalog.printings.map((p) => ({
          ...p,
          setSlug: slugById.get(p.setId) ?? "",
          card: catalog.cards[p.cardId],
        }));
      })()
    : [];

  const setInfoList: SetInfo[] = catalog ? catalog.sets : [];

  return { allCards, setInfoList, isLoading, error: error as Error | null };
}
