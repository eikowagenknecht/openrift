import type { MarketplaceInfoResponse } from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

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
    // Typed via the browser oRPC client (same-origin, edge-cacheable). The
    // contract validates the comma-joined query + the response shape.
    queryFn: (): Promise<MarketplaceInfoResponse> =>
      browserApiOrpcClient(pricesContract).marketplaceInfo({
        printings: stableIds.join(","),
      }),
    enabled: stableIds.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
