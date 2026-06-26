import { adminCardQueriesContract } from "@openrift/shared/contracts";
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
  .handler(
    ({ context }): Promise<AdminCardListResponse> =>
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

/**
 * Fetches the unchecked list and returns the first card slug that isn't
 * `currentSlug`. When `allowedSlugs` is provided, only returns a slug that
 * appears in that set — used to keep check-all-and-next scoped to the active
 * set filter on the detail page.
 * @returns an object with a `fetchNext` function that resolves to the next card slug or null
 */
export function useNextUncheckedCard(currentSlug: string, allowedSlugs?: Set<string> | null) {
  const queryClient = useQueryClient();

  async function fetchNext(): Promise<string | null> {
    const rows = await queryClient.fetchQuery(adminCardListQueryOptions);
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
  .handler(
    ({ context }): Promise<AllCardsResponse> =>
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

export function adminCardDetailQueryOptions(cardSlug: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.detail(cardSlug),
    queryFn: () => fetchAdminCardDetail({ data: cardSlug }),
    staleTime: 5 * 60 * 1000,
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
  .handler(
    ({ context }): Promise<ProviderStatsResponse> =>
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
  .handler(
    ({ context }): Promise<ProviderNamesResponse> =>
      apiOrpcClient(adminCardQueriesContract, context.cookie).providerNames(),
  );

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: () => fetchProviderNames(),
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}
