import { metaContract } from "@openrift/shared/contracts/meta";
import type {
  MetaActivityResponse,
  MetaCountsQuery,
  MetaCountsResponse,
  MetaDeckCardIndexResponse,
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
  MetaLegendDetailResponse,
  MetaLegendListResponse,
  MetaPlayerDetailResponse,
  MetaScopeQuery,
} from "@openrift/shared/types/api/meta";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { MetaDateRange, MetaDeckQuery } from "@/features/meta/lib/meta-scope";
import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

export type MetaLegendPageQuery = MetaScopeQuery & { page?: number };

function narrow<T extends object>(query?: T): T {
  return Object.fromEntries(
    Object.entries(query ?? {}).filter(([, value]) => value !== undefined),
  ) as T;
}

/** Defaults to {} because a bare GET to the endpoint arrives with no payload. */
export function optionalQuery<T extends object>(input?: T): T {
  return input ?? ({} as T);
}

function cacheKeyFor(query: Record<string, unknown>): unknown[] {
  return Object.entries(query)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flat();
}

const fetchMetaEvents = createServerFn({ method: "GET" })
  .validator(optionalQuery<MetaDateRange>)
  .middleware([withCookies])
  .handler(({ context, data: range }): Promise<MetaEventListResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "meta", "events", ...cacheKeyFor(range)],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).events(range),
    }),
  );

export function metaEventsQueryOptions(range?: MetaDateRange) {
  const narrowed = narrow(range);
  return queryOptions({
    queryKey: queryKeys.meta.events(narrowed),
    queryFn: () => fetchMetaEvents({ data: narrowed }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaEvents(range?: MetaDateRange) {
  return useSuspenseQuery(metaEventsQueryOptions(range));
}

const fetchMetaCounts = createServerFn({ method: "GET" })
  .validator(optionalQuery<MetaCountsQuery>)
  .middleware([withCookies])
  .handler(({ context, data: query }): Promise<MetaCountsResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "meta", "counts", ...cacheKeyFor(query)],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).counts(query),
    }),
  );

export function metaCountsQueryOptions(query?: MetaCountsQuery) {
  const narrowed = narrow(query);
  return queryOptions({
    queryKey: queryKeys.meta.counts(narrowed),
    queryFn: () => fetchMetaCounts({ data: narrowed }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaCounts(query?: MetaCountsQuery) {
  return useSuspenseQuery(metaCountsQueryOptions(query));
}

const fetchMetaActivity = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MetaActivityResponse> =>
    serverCache.query({
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
    // 404 maps to NOT_FOUND: the ApiError prototype doesn't survive the server-function boundary.
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
  .validator(optionalQuery<MetaDeckQuery>)
  .middleware([withCookies])
  .handler(({ context, data: query }): Promise<MetaDeckListResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "meta", "decks", ...cacheKeyFor(query)],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).decks(query),
    }),
  );

export function metaDecksQueryOptions(query?: MetaDeckQuery) {
  const narrowed = narrow(query);
  return queryOptions({
    queryKey: queryKeys.meta.decks(narrowed),
    queryFn: () => fetchMetaDecks({ data: narrowed }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaDecks(query?: MetaDeckQuery) {
  return useSuspenseQuery(metaDecksQueryOptions(query));
}

const fetchMetaDeckCards = createServerFn({ method: "GET" })
  .validator(optionalQuery<MetaDateRange>)
  .middleware([withCookies])
  .handler(({ context, data: range }): Promise<MetaDeckCardIndexResponse> =>
    serverCache.query({
      queryKey: ["server-cache", "meta", "deck-cards", range.from ?? null, range.to ?? null],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).deckCards(range),
    }),
  );

function metaDeckCardsQueryOptions(range?: MetaDateRange) {
  const narrowed = narrow(range);
  return queryOptions({
    queryKey: queryKeys.meta.deckCards(narrowed),
    queryFn: () => fetchMetaDeckCards({ data: narrowed }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaDeckCards(range?: MetaDateRange) {
  return useSuspenseQuery(metaDeckCardsQueryOptions(range));
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
    serverCache.query({
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
  .validator((input: MetaLegendPageQuery & { slug: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: query }): Promise<MetaLegendDetailResponse> => {
    const { error, data } = await safe(apiOrpcClient(metaContract, context.cookie).legend(query));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function metaLegendQueryOptions(slug: string, query?: MetaLegendPageQuery) {
  const narrowed = narrow(query);
  return queryOptions({
    queryKey: queryKeys.meta.legend(slug, narrowed),
    queryFn: () => fetchMetaLegend({ data: { ...narrowed, slug } }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaLegend(slug: string, query?: MetaLegendPageQuery) {
  return useSuspenseQuery(metaLegendQueryOptions(slug, query));
}

const fetchMetaPlayer = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: key }): Promise<MetaPlayerDetailResponse> => {
    const { error, data } = await safe(apiOrpcClient(metaContract, context.cookie).player({ key }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function metaPlayerQueryOptions(key: string) {
  return queryOptions({
    queryKey: queryKeys.meta.player(key),
    queryFn: () => fetchMetaPlayer({ data: key }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaPlayer(key: string) {
  return useSuspenseQuery(metaPlayerQueryOptions(key));
}
