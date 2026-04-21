import type { Printing, PromosListResponse } from "@openrift/shared";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

const fetchPromoList = createServerFn({ method: "GET" }).handler(
  (): Promise<PromosListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "promos"],
      queryFn: () =>
        fetchApiJson<PromosListResponse>({
          errorTitle: "Couldn't load promos",
          path: "/api/v1/promos",
        }),
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
