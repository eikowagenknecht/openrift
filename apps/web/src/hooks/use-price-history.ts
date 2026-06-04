import type { PriceHistoryResponse, TimeRange } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchPriceHistoryFn = createServerFn({ method: "GET" })
  // range is the TimeRange enum on the route (was loose `string` under fetchApi).
  .inputValidator((input: { printingId: string; range: TimeRange }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PriceHistoryResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.prices[":printingId"].history.$get({
          param: encodeParams({ printingId: data.printingId }),
          query: { range: data.range },
        }),
        "Couldn't load price history",
      ),
  );

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () =>
      fetchPriceHistoryFn({
        // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
        data: { printingId: printingId!, range },
      }),
    // Snapshot prices are integer cents on the wire (SCH-2); convert to major
    // units here so the charts keep working in the same unit as before.
    select: (data): PriceHistoryResponse => ({
      tcgplayer: {
        ...data.tcgplayer,
        snapshots: data.tcgplayer.snapshots.map((s) => ({
          date: s.date,
          market: s.market / 100,
          low: centsToMajor(s.low),
        })),
      },
      cardmarket: {
        ...data.cardmarket,
        snapshots: data.cardmarket.snapshots.map((s) => ({
          date: s.date,
          market: s.market / 100,
          low: centsToMajor(s.low),
        })),
      },
      cardtrader: {
        ...data.cardtrader,
        snapshots: data.cardtrader.snapshots.map((s) => ({
          date: s.date,
          zeroLow: centsToMajor(s.zeroLow),
          low: centsToMajor(s.low),
        })),
      },
    }),
    enabled: Boolean(printingId),
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

function centsToMajor(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}
