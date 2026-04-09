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
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchAdminCardList = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminCardListResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Admin card list fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminCardListResponse>;
  });

export const adminCardListQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.list,
  queryFn: () => fetchAdminCardList(),
});

export function useAdminCardList() {
  return useSuspenseQuery(adminCardListQueryOptions);
}

/**
 * Fetches the unchecked list and returns the first card slug that isn't `currentCardId`.
 * @returns an object with a `fetchNext` function that resolves to the next card slug or null
 */
export function useNextUncheckedCard(currentCardId: string) {
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
        r.cardSlug !== currentCardId &&
        r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
    );
    return next?.cardSlug ?? null;
  }

  return { fetchNext };
}

const fetchAllCards = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AllCardsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/all-cards`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`All cards fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AllCardsResponse>;
  });

export const allCardsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.allCards,
  queryFn: () => fetchAllCards(),
});

export function useAllCards() {
  return useSuspenseQuery(allCardsQueryOptions);
}

const fetchAdminCardDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: cardSlug }): Promise<AdminCardDetailResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/${encodeURIComponent(cardSlug)}`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Admin card detail fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminCardDetailResponse>;
  });

export function adminCardDetailQueryOptions(cardSlug: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.detail(cardSlug),
    queryFn: () => fetchAdminCardDetail({ data: cardSlug }),
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
  .handler(async ({ context, data: name }): Promise<UnmatchedCardDetailResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/new/${encodeURIComponent(name)}`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Unmatched card detail fetch failed: ${res.status}`);
    }
    return res.json() as Promise<UnmatchedCardDetailResponse>;
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
  .handler(async ({ context }): Promise<ProviderStatsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/provider-stats`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Provider stats fetch failed: ${res.status}`);
    }
    return res.json() as Promise<ProviderStatsResponse>;
  });

export const providerStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerStats,
  queryFn: () => fetchProviderStats(),
});

export function useProviderStats() {
  return useSuspenseQuery(providerStatsQueryOptions);
}

const fetchProviderNames = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<ProviderNamesResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/provider-names`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Provider names fetch failed: ${res.status}`);
    }
    return res.json() as Promise<ProviderNamesResponse>;
  });

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: () => fetchProviderNames(),
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}
