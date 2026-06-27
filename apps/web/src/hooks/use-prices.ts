import type { PriceLookup, PricesResponse } from "@openrift/shared";
import { priceLookupFromMap } from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useSyncedPrices } from "@/lib/prices-collection";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPrices = createServerFn({ method: "GET" }).handler(
  (): Promise<PricesResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "prices"],
      queryFn: () => apiOrpcClient(pricesContract).prices(),
    }),
);

// Client-side fetch goes directly to /api/v1/prices so Cloudflare can serve
// it from the edge cache — same pattern as use-cards.ts. The oRPC OpenAPI link
// resolves the route from the contract and decodes the typed response.
function fetchPricesFromEdge(): Promise<PricesResponse> {
  return browserApiOrpcClient(pricesContract).prices();
}

export const pricesQueryOptions = queryOptions({
  queryKey: queryKeys.prices.all,
  queryFn: () => (globalThis.window === undefined ? fetchPrices() : fetchPricesFromEdge()),
  // Prices refresh once per day, so a long staleTime is fine. The server cache
  // and react-query refetch policies handle propagation when prices do change.
  staleTime: 30 * 60 * 1000, // 30 minutes
  refetchOnWindowFocus: false,
  select: (response: PricesResponse): PriceLookup => priceLookupFromMap(response.prices),
});

/**
 * Hook returning a {@link PriceLookup} for the latest marketplace prices.
 * Components that filter, sort, or display by price compose this with `useCards()`.
 *
 * Two price sources, evaluated in a fixed hook order:
 *  - the synced on-device prices (ADR-027): present once the public
 *    latest-prices shape has finished its initial sync, then served instantly
 *    on every return visit and updated in the background as prices change.
 *    Null on the server, pre-hydration, while persistence/sync settle, and in
 *    OPFS-less browsers.
 *  - the edge `/api/v1/prices` fetch: the SSR path prefetches it, so it is the
 *    byte-equivalent fallback that keeps first paint and crawlers unchanged.
 *
 * The suspense query is always subscribed (stable hooks, and it is what the
 * shell suspends on for the very first load). When the synced lookup is ready
 * it wins; both resolve to the same `PriceLookup` (cents → major units).
 *
 * @returns A lookup wired to the synced prices when ready, else the cached
 *   `/api/v1/prices` response.
 */
export function usePrices(): PriceLookup {
  const synced = useSyncedPrices();
  const { data } = useSuspenseQuery(pricesQueryOptions);
  return synced ?? data;
}

/**
 * Imperatively resolves a {@link PriceLookup} outside of React render (e.g. when
 * building the share text on a click), fetching once and reusing the cache.
 * @returns A lookup backed by the cached `/api/v1/prices` payload.
 */
export async function ensurePriceLookup(queryClient: QueryClient): Promise<PriceLookup> {
  const response = await queryClient.ensureQueryData({
    queryKey: pricesQueryOptions.queryKey,
    queryFn: pricesQueryOptions.queryFn,
  });
  return priceLookupFromMap(response.prices);
}
