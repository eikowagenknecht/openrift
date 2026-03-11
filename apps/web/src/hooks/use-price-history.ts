import type { PriceHistoryResponse, TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () =>
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
      api.get<PriceHistoryResponse>(`/api/prices/${printingId!}/history?range=${range}`),
    enabled: Boolean(printingId),
    staleTime: 10 * 60 * 1000,
  });
}
