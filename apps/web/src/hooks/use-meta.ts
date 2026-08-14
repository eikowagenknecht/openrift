import type {
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
  MetaStatsResponse,
} from "@openrift/shared";
import { metaContract } from "@openrift/shared/contracts/meta";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Filters that scope the meta stats to one format and/or date window. */
export interface MetaStatsParams {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

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

const fetchMetaStats = createServerFn({ method: "GET" })
  .validator((input: MetaStatsParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaStatsResponse> =>
    serverCache.fetchQuery({
      // The filters scope the aggregate, so they belong in the cache key —
      // otherwise a filtered view would serve the unfiltered numbers.
      queryKey: [
        "server-cache",
        "meta",
        "stats",
        data.format ?? null,
        data.dateFrom ?? null,
        data.dateTo ?? null,
      ],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).stats(data),
    }),
  );

export function metaStatsQueryOptions(params: MetaStatsParams = {}) {
  return queryOptions({
    queryKey: queryKeys.meta.stats(params.format, params.dateFrom, params.dateTo),
    queryFn: () => fetchMetaStats({ data: params }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaStats(params: MetaStatsParams = {}) {
  return useSuspenseQuery(metaStatsQueryOptions(params));
}
