import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchOwnedCountFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/copies/count`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Owned count fetch failed: ${res.status}`);
    }
    return res.json() as Promise<{ items: Record<string, number> }>;
  });

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => fetchOwnedCountFn(),
    select: (data) => data.items,
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

interface CollectionBreakdownEntry {
  collectionId: string;
  collectionName: string;
  count: number;
}

const fetchOwnedCollectionsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<{ items: CollectionBreakdownEntry[] }> => {
    const params = new URLSearchParams({ printingId: data.printingId });
    const res = await fetch(`${API_URL}/api/v1/copies/count-by-collection?${params.toString()}`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Owned collections fetch failed: ${res.status}`);
    }
    return res.json() as Promise<{ items: CollectionBreakdownEntry[] }>;
  });

export function useOwnedCollections(printingId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.byCollection(printingId),
    queryFn: () => fetchOwnedCollectionsFn({ data: { printingId } }),
    select: (data) => data.items,
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
