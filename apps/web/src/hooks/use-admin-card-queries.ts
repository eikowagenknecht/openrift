import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const adminCardListQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.list,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"].$get();
    assertOk(res);
    return await res.json();
  },
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

export const allCardsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.allCards,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["all-cards"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useAllCards() {
  return useSuspenseQuery(allCardsQueryOptions);
}

export function adminCardDetailQueryOptions(cardId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.detail(cardId),
    queryFn: async () => {
      const res = await client.api.v1.admin["cards"][":cardId"].$get({ param: { cardId } });
      assertOk(res);
      return await res.json();
    },
  });
}

export function useAdminCardDetail(cardId: string) {
  return useQuery({
    ...adminCardDetailQueryOptions(cardId),
    enabled: Boolean(cardId),
  });
}

export function unmatchedCardDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.unmatched(name),
    queryFn: async () => {
      const res = await client.api.v1.admin["cards"].new[":name"].$get({ param: { name } });
      assertOk(res);
      return await res.json();
    },
  });
}

export function useUnmatchedCardDetail(name: string) {
  return useQuery({
    ...unmatchedCardDetailQueryOptions(name),
    enabled: Boolean(name),
  });
}

export const providerStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerStats,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["provider-stats"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useProviderStats() {
  return useSuspenseQuery(providerStatsQueryOptions);
}

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["provider-names"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}
