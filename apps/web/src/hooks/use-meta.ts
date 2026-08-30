import type {
  MetaCountsResponse,
  MetaDeckDetailResponse,
  MetaDeckListResponse,
  MetaEventDetailResponse,
  MetaEventListResponse,
} from "@openrift/shared";
import { metaContract } from "@openrift/shared/contracts/meta";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Filters that scope the archive counts to one format and/or date window. */
export type MetaCountsParams = ContractInput<typeof metaContract, "counts">;

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

const fetchMetaCounts = createServerFn({ method: "GET" })
  .validator((input: MetaCountsParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<MetaCountsResponse> =>
    serverCache.fetchQuery({
      // The filters scope the counts, so they belong in the cache key —
      // otherwise a filtered view would serve the unfiltered numbers.
      queryKey: [
        "server-cache",
        "meta",
        "counts",
        data.format ?? null,
        data.dateFrom ?? null,
        data.dateTo ?? null,
      ],
      queryFn: () => apiOrpcClient(metaContract, context.cookie).counts(data),
    }),
  );

export function metaCountsQueryOptions(params: MetaCountsParams = {}) {
  return queryOptions({
    queryKey: queryKeys.meta.counts(params.format, params.dateFrom, params.dateTo),
    queryFn: () => fetchMetaCounts({ data: params }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMetaCounts(params: MetaCountsParams = {}) {
  return useSuspenseQuery(metaCountsQueryOptions(params));
}
