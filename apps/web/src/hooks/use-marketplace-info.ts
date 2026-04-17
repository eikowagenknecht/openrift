import type { MarketplaceInfoResponse } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/**
 * Fetch `MarketplaceInfo` (productId, languageAggregate, availability) for a
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
    queryFn: async (): Promise<MarketplaceInfoResponse> => {
      const params = new URLSearchParams({ printings: stableIds.join(",") });
      const res = await fetch(`/api/v1/prices/marketplace-info?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Marketplace info fetch failed: ${res.status}`);
      }
      return res.json() as Promise<MarketplaceInfoResponse>;
    },
    enabled: stableIds.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
