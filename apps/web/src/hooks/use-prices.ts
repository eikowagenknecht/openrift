import type { PriceLookup, PricesResponse } from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { API_URL } from "@/lib/server-fns/api-url";

const fetchPrices = createServerFn({ method: "GET" }).handler(
  (): Promise<PricesResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "prices"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/prices`);
        if (!res.ok) {
          throw new Error(`Prices fetch failed: ${res.status}`);
        }
        return res.json() as Promise<PricesResponse>;
      },
    }),
);

const pricesQueryOptions = queryOptions({
  queryKey: queryKeys.prices.all,
  queryFn: () => fetchPrices(),
  // Prices refresh once per day, so a long staleTime is fine. The server cache
  // and react-query refetch policies handle propagation when prices do change.
  staleTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  select: (response: PricesResponse): PriceLookup => priceLookupFromMap(response.prices),
});

/**
 * Suspense hook returning a {@link PriceLookup} backed by the latest /api/v1/prices payload.
 * Components that filter, sort, or display by price compose this with `useCards()`.
 * @returns A lookup wired to the cached `/api/v1/prices` response.
 */
export function usePrices(): PriceLookup {
  const { data } = useSuspenseQuery(pricesQueryOptions);
  return data;
}
