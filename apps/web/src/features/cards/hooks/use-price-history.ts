import { pricesContract } from "@openrift/shared/contracts/prices";
import type { PriceHistoryResponse } from "@openrift/shared/types/api/pricing";
import type { TimeRange } from "@openrift/shared/types/pricing";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { priceHistoryKeys } from "@/features/cards/lib/cards-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPriceHistoryFn = createServerFn({ method: "GET" })
  .validator((input: { printingId: string; range: TimeRange }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<PriceHistoryResponse> =>
    apiOrpcClient(pricesContract, context.cookie).history({
      printingId: data.printingId,
      range: data.range,
    }),
  );

export function usePriceHistory(printingId: string | null, range: TimeRange = "30d") {
  return useQuery({
    queryKey: priceHistoryKeys.byPrinting(printingId ?? "", range),
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
