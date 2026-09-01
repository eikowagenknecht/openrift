import type {
  MetaActivityResponse,
  MetaDeckCardIndexResponse,
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
  MetaLegendDetailResponse,
  MetaLegendListResponse,
} from "@openrift/shared";
import { metaContract } from "@openrift/shared/contracts/meta";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

// Every read here is public and identical for every visitor, so the SSR
// responses go through the shared `serverCache` rather than being refetched
// per request.

const fetchMetaEvents = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaEventListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "meta", "events"],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).events(),
    }),
  );

export const metaEventsQueryOptions = queryOptions({
  queryKey: queryKeys.meta.events,
  queryFn: () => fetchMetaEvents(),
  staleTime: 5 * 60 * 1000,
});

export function useMetaEvents() {
  return useSuspenseQuery(metaEventsQueryOptions);
}

const fetchMetaActivity = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaActivityResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "meta", "activity"],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).activity(),
    }),
  );

export const metaActivityQueryOptions = queryOptions({
  queryKey: queryKeys.meta.activity,
  queryFn: () => fetchMetaActivity(),
  staleTime: 5 * 60 * 1000,
});

export function useMetaActivity() {
  return useSuspenseQuery(metaActivityQueryOptions);
}

const fetchMetaEvent = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<MetaEventDetailResponse> => {
    // 404 maps to the NOT_FOUND sentinel the route boundary expects — the
    // ApiError prototype doesn't survive the server-function boundary.
    const { error, data } = await safe(apiOrpcClient(metaContract, context.cookie).event({ slug }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function metaEventQueryOptions(slug: string) {
  return queryOptions({
    queryKey: queryKeys.meta.event(slug),
    queryFn: () => fetchMetaEvent({ data: slug }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaEvent(slug: string) {
  return useSuspenseQuery(metaEventQueryOptions(slug));
}

const fetchMetaDecks = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaDeckListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "meta", "decks"],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).decks(),
    }),
  );

/**
 * The whole archive in one payload. The deck browser narrows it client-side
 * (ADR-014), so there is deliberately no per-filter query key.
 */
export const metaDecksQueryOptions = queryOptions({
  queryKey: queryKeys.meta.decks,
  queryFn: () => fetchMetaDecks(),
  staleTime: 5 * 60 * 1000,
});

export function useMetaDecks() {
  return useSuspenseQuery(metaDecksQueryOptions);
}

const fetchMetaDeckCards = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaDeckCardIndexResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "meta", "deck-cards"],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).deckCards(),
    }),
  );

/**
 * What every archived list is made of, for the browser's collection overlay.
 * Fetched on its own rather than folded into the deck payload: it is several
 * times the size, and only a signed-in reader has anything to compare it against.
 */
const metaDeckCardsQueryOptions = queryOptions({
  queryKey: queryKeys.meta.deckCards,
  queryFn: () => fetchMetaDeckCards(),
  staleTime: 5 * 60 * 1000,
});

export function useMetaDeckCards() {
  return useSuspenseQuery(metaDeckCardsQueryOptions);
}

const fetchMetaDeck = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: token }): Promise<MetaDeckDetailResponse> => {
    const { error, data } = await safe(apiOrpcClient(metaContract, context.cookie).deck({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function metaDeckQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.meta.deck(token),
    queryFn: () => fetchMetaDeck({ data: token }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaDeck(token: string) {
  return useSuspenseQuery(metaDeckQueryOptions(token));
}

const fetchMetaLegends = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaLegendListResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "meta", "legends"],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).legends(),
    }),
  );

export const metaLegendsQueryOptions = queryOptions({
  queryKey: queryKeys.meta.legends,
  queryFn: () => fetchMetaLegends(),
  staleTime: 5 * 60 * 1000,
});

export function useMetaLegends() {
  return useSuspenseQuery(metaLegendsQueryOptions);
}

const fetchMetaLegend = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: slug }): Promise<MetaLegendDetailResponse> => {
    const { error, data } = await safe(
      apiOrpcClient(metaContract, context.cookie).legend({ slug }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function metaLegendQueryOptions(slug: string) {
  return queryOptions({
    queryKey: queryKeys.meta.legend(slug),
    queryFn: () => fetchMetaLegend({ data: slug }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaLegend(slug: string) {
  return useSuspenseQuery(metaLegendQueryOptions(slug));
}
