import type { MarketplaceInfoResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiClient, callApiJson } from "@/lib/server-fns/api-client";

/**
 * Fetch `MarketplaceInfo` (productId, availability) for a
 * batch of printings so callers can craft per-marketplace deep-link URLs.
 *
 * The printing list is sorted before use so the query key is stable across
 * prop-order changes, and empty input short-circuits to skip the request.
 * @returns react-query result carrying a `MarketplaceInfoResponse`.
 */
export function useMarketplaceInfo(printingIds: string[]) {
  const stableIds = [...new Set(printingIds)].toSorted();
  return useQuery({
    queryKey: queryKeys.marketplaceInfo.byPrintings(stableIds),
    // Typed via the browser hc client (same-origin, edge-cacheable). The route
    // checks the query + response against the API contract.
    queryFn: (): Promise<MarketplaceInfoResponse> =>
      callApiJson(
        browserApiClient().api.v1.prices["marketplace-info"].$get({
          query: { printings: stableIds.join(",") },
        }),
        "Couldn't load marketplace info",
      ),
    enabled: stableIds.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
