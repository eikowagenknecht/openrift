import type { TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi } from "@/lib/server-fns";

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () => fetchApi({ data: `/api/prices/${printingId}/history?range=${range}` }),
    enabled: Boolean(printingId),
    staleTime: 10 * 60 * 1000,
  });
}
