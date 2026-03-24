import type { TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () =>
      rpc(
        client.api.v1.prices[":printingId"].history.$get({
          // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
          param: { printingId: printingId! },
          query: { range },
        }),
      ),
    enabled: Boolean(printingId),
    staleTime: 10 * 60 * 1000,
  });
}
