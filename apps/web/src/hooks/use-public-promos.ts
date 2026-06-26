import type { Printing, PromosListResponse } from "@openrift/shared";
import { promosContract } from "@openrift/shared/contracts";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPromoList = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PromosListResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "promos"],
        // Migrated to oRPC: contract-typed client instead of the hc client.
        queryFn: () => apiOrpcClient(promosContract, context.cookie).list(),
      }),
  );

interface EnrichedPromoList {
  channels: PromosListResponse["channels"];
  printings: Printing[];
  cards: PromosListResponse["cards"];
}

function enrichPromoList(response: PromosListResponse): EnrichedPromoList {
  const setSlugPlaceholder = "";
  const printings: Printing[] = response.printings.map((p) => ({
    ...p,
    setSlug: setSlugPlaceholder,
    setReleased: true,
    card: response.cards[p.cardId],
  }));
  return { channels: response.channels, printings, cards: response.cards };
}

export const publicPromoListQueryOptions = queryOptions({
  queryKey: queryKeys.promos.all,
  queryFn: () => fetchPromoList(),
  staleTime: 5 * 60 * 1000,
  select: enrichPromoList,
});
