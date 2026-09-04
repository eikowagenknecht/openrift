import type { Printing, PromosListResponse } from "@openrift/shared";
import { promosContract } from "@openrift/shared/contracts/promos";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPromoList = createServerFn({ method: "GET" })
  .validator((language: string) => language)
  .middleware([withCookies])
  .handler(({ context, data: language }): Promise<PromosListResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "promos", language],
      queryFn: () => apiOrpcClient(promosContract, context.cookie).list({ language }),
    }),
  );

interface EnrichedPromoList {
  channels: PromosListResponse["channels"];
  printings: Printing[];
  cards: PromosListResponse["cards"];
  sets: PromosListResponse["sets"];
  languages: string[];
}

function enrichPromoList(response: PromosListResponse): EnrichedPromoList {
  const setSlugById = new Map(response.sets.map((set) => [set.id, set.slug]));
  const printings: Printing[] = response.printings.map((p) => ({
    ...p,
    setSlug: setSlugById.get(p.setId) ?? "",
    setReleased: true,
    card: response.cards[p.cardId],
  }));
  return {
    channels: response.channels,
    printings,
    cards: response.cards,
    sets: response.sets,
    languages: response.languages,
  };
}

export function publicPromoListQueryOptions(language: string) {
  return queryOptions({
    queryKey: queryKeys.promos.forLanguage(language),
    queryFn: () => fetchPromoList({ data: language }),
    staleTime: 5 * 60 * 1000,
    select: enrichPromoList,
  });
}
