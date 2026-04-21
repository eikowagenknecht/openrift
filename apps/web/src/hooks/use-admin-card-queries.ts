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
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchAdminCardList = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminCardListResponse> =>
      fetchApiJson<AdminCardListResponse>({
        errorTitle: "Couldn't load admin card list",
        cookie: context.cookie,
        path: "/api/v1/admin/cards",
      }),
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
 * Fetches the unchecked list and returns the first card slug that isn't `currentSlug`.
 * @returns an object with a `fetchNext` function that resolves to the next card slug or null
 */
export function useNextUncheckedCard(currentSlug: string) {
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
        r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
    );
    return next?.cardSlug ?? null;
  }

  return { fetchNext };
}

const fetchAllCards = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AllCardsResponse> =>
      fetchApiJson<AllCardsResponse>({
        errorTitle: "Couldn't load all cards",
        cookie: context.cookie,
        path: "/api/v1/admin/cards/all-cards",
      }),
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
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: cardSlug }): Promise<AdminCardDetailResponse> =>
      fetchApiJson<AdminCardDetailResponse>({
        errorTitle: "Couldn't load admin card detail",
        cookie: context.cookie,
        path: `/api/v1/admin/cards/${encodeURIComponent(cardSlug)}`,
      }),
  );

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
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: name }): Promise<UnmatchedCardDetailResponse> =>
      fetchApiJson<UnmatchedCardDetailResponse>({
        errorTitle: "Couldn't load unmatched card detail",
        cookie: context.cookie,
        path: `/api/v1/admin/cards/new/${encodeURIComponent(name)}`,
      }),
  );

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
      fetchApiJson<ProviderStatsResponse>({
        errorTitle: "Couldn't load provider stats",
        cookie: context.cookie,
        path: "/api/v1/admin/cards/provider-stats",
      }),
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
      fetchApiJson<ProviderNamesResponse>({
        errorTitle: "Couldn't load provider names",
        cookie: context.cookie,
        path: "/api/v1/admin/cards/provider-names",
      }),
  );

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: () => fetchProviderNames(),
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}
