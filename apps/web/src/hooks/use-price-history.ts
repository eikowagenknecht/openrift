import type { PriceHistoryResponse, TimeRange } from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts/prices";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPriceHistoryFn = createServerFn({ method: "GET" })
  // range is the TimeRange enum on the route (was loose `string` under fetchApi).
  .validator((input: { printingId: string; range: TimeRange }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<PriceHistoryResponse> =>
      apiOrpcClient(pricesContract, context.cookie).history({
        printingId: data.printingId,
        range: data.range,
      }),
  );

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: queryKeys.priceHistory.byPrinting(printingId ?? "", range),
    queryFn: () =>
      fetchPriceHistoryFn({
        // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- guarded by enabled: Boolean(printingId)
        data: { printingId: printingId!, range },
      }),
    // Snapshot prices are integer cents on the wire; convert to major
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
