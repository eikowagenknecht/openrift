import type { MarketplaceInfoResponse } from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts/prices";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Deduped and sorted before use so the query key is stable across prop-order changes. */
export function useMarketplaceInfo(printingIds: string[]) {
  const stableIds = [...new Set(printingIds)].toSorted();
  return useQuery({
    queryKey: queryKeys.marketplaceInfo.byPrintings(stableIds),
    queryFn: (): Promise<MarketplaceInfoResponse> =>
      browserApiOrpcClient(pricesContract).marketplaceInfo({
        printings: stableIds.join(","),
      }),
    enabled: stableIds.length > 0,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
