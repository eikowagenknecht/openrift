import type { PriceHistoryResponse, TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

async function fetchPriceHistory(
  printingId: string,
  range: TimeRange,
): Promise<PriceHistoryResponse> {
  const res = await fetch(`/api/prices/${printingId}/history?range=${range}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch price history: ${res.status}`);
  }
  return res.json() as Promise<PriceHistoryResponse>;
}

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
    queryFn: () => fetchPriceHistory(printingId!, range),
    enabled: Boolean(printingId),
    staleTime: 10 * 60 * 1000,
  });
}
