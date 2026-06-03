import type { Printing, PromosListResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchPromoList = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PromosListResponse> =>
      serverCache.fetchQuery({
        queryKey: ["server-cache", "promos"],
        queryFn: () =>
          callApiJson(serverApiClient(context.cookie).api.v1.promos.$get(), "Couldn't load promos"),
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
