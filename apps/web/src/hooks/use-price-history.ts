import type { PriceHistoryResponse, TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchPriceHistoryFn = createServerFn({ method: "GET" })
  .inputValidator((input: { printingId: string; range: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const params = new URLSearchParams({ range: data.range });
    return fetchApiJson<PriceHistoryResponse>({
      errorTitle: "Couldn't load price history",
      cookie: context.cookie,
      path: `/api/v1/prices/${encodeURIComponent(data.printingId)}/history?${params.toString()}`,
    });
  });

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () =>
      fetchPriceHistoryFn({
        // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
        data: { printingId: printingId!, range },
      }),
    enabled: Boolean(printingId),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
