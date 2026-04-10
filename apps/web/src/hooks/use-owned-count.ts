import type {
  CopyCollectionBreakdownEntry,
  CopyCollectionBreakdownResponse,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchOwnedBreakdownFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<CopyCollectionBreakdownResponse> => {
    const res = await fetch(`${API_URL}/api/v1/copies/count-by-collection`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Owned breakdown fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CopyCollectionBreakdownResponse>;
  });

const STALE_TIME_MS = 60_000;

const selectTotals = (data: CopyCollectionBreakdownResponse): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const [printingId, entries] of Object.entries(data.items)) {
    let sum = 0;
    for (const entry of entries) {
      sum += entry.count;
    }
    totals[printingId] = sum;
  }
  return totals;
};

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => fetchOwnedBreakdownFn(),
    select: selectTotals,
    enabled,
    staleTime: STALE_TIME_MS,
  });
}

export function useOwnedCollections(printingId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => fetchOwnedBreakdownFn(),
    select: (data: CopyCollectionBreakdownResponse): CopyCollectionBreakdownEntry[] =>
      data.items[printingId] ?? [],
    enabled,
    staleTime: STALE_TIME_MS,
  });
}
