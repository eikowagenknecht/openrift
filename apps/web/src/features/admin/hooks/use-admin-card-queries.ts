import { adminCardQueriesContract } from "@openrift/shared/contracts/admin/card-queries";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type {
  AdminCardDetailResponse,
  AdminCardListResponse,
  AllCardsResponse,
  ProviderNamesResponse,
  ProviderStatsResponse,
  UnmatchedCardDetailResponse,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchAdminCardList = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminCardListResponse> =>
    apiOrpcClient(adminCardQueriesContract, context.cookie).listCandidates(),
  );

export const adminCardListQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.list,
  queryFn: () => fetchAdminCardList(),
  staleTime: 5 * 60 * 1000,
});

export function useAdminCardList() {
  return useSuspenseQuery(adminCardListQueryOptions);
}

/** Non-suspending variant so a caller can skip fetching the whole list when unused. */
export function useAdminCardListWhen(enabled: boolean) {
  return useQuery({ ...adminCardListQueryOptions, enabled });
}

export function useNextUncheckedCard(currentSlug: string, allowedSlugs?: Set<string> | null) {
  const queryClient = useQueryClient();

  async function fetchNext(): Promise<string | null> {
    const rows = await queryClient.query(adminCardListQueryOptions);
    const next = rows.find(
      (r: {
        cardSlug: string | null;
        uncheckedCardCount: number;
        uncheckedPrintingCount: number;
      }) =>
        r.cardSlug &&
        r.cardSlug !== currentSlug &&
        r.uncheckedCardCount + r.uncheckedPrintingCount > 0 &&
        (!allowedSlugs || allowedSlugs.has(r.cardSlug)),
    );
    return next?.cardSlug ?? null;
  }

  return { fetchNext };
}

const fetchAllCards = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AllCardsResponse> =>
    apiOrpcClient(adminCardQueriesContract, context.cookie).allCards(),
  );

export const allCardsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.allCards,
  queryFn: () => fetchAllCards(),
  staleTime: 5 * 60 * 1000,
});

export function useAllCards() {
  return useSuspenseQuery(allCardsQueryOptions);
}

const fetchAdminCardDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: cardSlug }): Promise<AdminCardDetailResponse> => {
    // The contract output is intentionally loose (`z.unknown()`); the service
    // returns the rich detail shape, so cast to its hand-written interface.
    const result = await apiOrpcClient(adminCardQueriesContract, context.cookie).getCandidateCard({
      cardSlug,
    });
    return result as AdminCardDetailResponse;
  });

const REHOST_POLL_INTERVAL_MS = 3000;

/**
 * Rehosting runs as a fire-and-forget background job, so `rehostedUrl` stays
 * null until it finishes. Images with no `originalUrl` can never be rehosted
 * and are ignored, or polling would never stop.
 */
export function hasPendingRehost(data?: {
  printingImages?: readonly { originalUrl: string | null; rehostedUrl: string | null }[];
}): boolean {
  return (
    data?.printingImages?.some(
      (image) => image.originalUrl !== null && image.rehostedUrl === null,
    ) ?? false
  );
}

export function adminCardDetailQueryOptions(cardSlug: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.detail(cardSlug),
    queryFn: () => fetchAdminCardDetail({ data: cardSlug }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) =>
      hasPendingRehost(query.state.data) ? REHOST_POLL_INTERVAL_MS : false,
  });
}

export function useAdminCardDetail(cardSlug: string) {
  return useQuery({
    ...adminCardDetailQueryOptions(cardSlug),
    enabled: Boolean(cardSlug),
  });
}

const fetchUnmatchedCardDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: name }): Promise<UnmatchedCardDetailResponse> => {
    const result = await apiOrpcClient(adminCardQueriesContract, context.cookie).getUnmatchedDetail(
      { name },
    );
    return result as UnmatchedCardDetailResponse;
  });

export function unmatchedCardDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.unmatched(name),
    queryFn: () => fetchUnmatchedCardDetail({ data: name }),
  });
}

export function useUnmatchedCardDetail(name: string) {
  return useQuery({
    ...unmatchedCardDetailQueryOptions(name),
    enabled: Boolean(name),
  });
}

const fetchProviderStats = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<ProviderStatsResponse> =>
    apiOrpcClient(adminCardQueriesContract, context.cookie).providerStats(),
  );

export const providerStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerStats,
  queryFn: () => fetchProviderStats(),
});

export function useProviderStats() {
  return useSuspenseQuery(providerStatsQueryOptions);
}

const fetchProviderNames = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<ProviderNamesResponse> =>
    apiOrpcClient(adminCardQueriesContract, context.cookie).providerNames(),
  );

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: () => fetchProviderNames(),
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}
