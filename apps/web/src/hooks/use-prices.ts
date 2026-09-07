import type { PriceLookup, PricesResponse } from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts/prices";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPrices = createServerFn({ method: "GET" }).handler((): Promise<PricesResponse> =>
  serverCache.query({
    queryKey: ["server-cache", "prices"],
    queryFn: () => apiOrpcClient(pricesContract).prices(),
  }),
);

// Goes directly to /api/v1/prices so Cloudflare can serve it from the edge cache.
function fetchPricesFromEdge(): Promise<PricesResponse> {
  return browserApiOrpcClient(pricesContract).prices();
}

// Do not use `pricesQueryOptions` on the server here: it would dehydrate the whole
// catalog price map into SSR HTML for a few JSON-LD offers.
export function fetchPricesForSeo(): Promise<PricesResponse> {
  return fetchPrices();
}

export const pricesQueryOptions = queryOptions({
  queryKey: queryKeys.prices.all,
  queryFn: () => (globalThis.window === undefined ? fetchPrices() : fetchPricesFromEdge()),
  staleTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  select: (response: PricesResponse): PriceLookup => priceLookupFromMap(response.prices),
});

export function usePrices(): PriceLookup {
  const { data } = useSuspenseQuery(pricesQueryOptions);
  return data;
}

// Resolves a PriceLookup outside of React render (e.g. building share text on a click).
export async function ensurePriceLookup(queryClient: QueryClient): Promise<PriceLookup> {
  const response = await queryClient.query({
    queryKey: pricesQueryOptions.queryKey,
    queryFn: pricesQueryOptions.queryFn,
    staleTime: "static",
  });
  return priceLookupFromMap(response.prices);
}
