import type { TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchPriceHistoryFn = createServerFn({ method: "GET" })
  .inputValidator((input: { printingId: string; range: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const params = new URLSearchParams({ range: data.range });
    const res = await fetch(
      `${API_URL}/api/v1/prices/${encodeURIComponent(data.printingId)}/history?${params.toString()}`,
      { headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Price history fetch failed: ${res.status}`);
    }
    return res.json();
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
