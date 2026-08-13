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

/**
 * Non-suspending variant for pages that only need the list under a condition —
 * the card detail page reads it to scope prev/next to the new-printings filter,
 * and must not pay for the whole list when that filter is off.
 *
 * @returns The card-list query, disabled unless `enabled`.
 */
export function useAdminCardListWhen(enabled: boolean) {
  return useQuery({ ...adminCardListQueryOptions, enabled });
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

/** Cadence for re-fetching the detail while a just-accepted image is still
 * being rehosted in the background. Rehosting one image is quick, so a tight
 * poll makes the view swap from the external URL to the self-hosted webp within
 * a few seconds without the admin reloading. */
const REHOST_POLL_INTERVAL_MS = 3000;

/**
 * Whether any printing image in the detail response has a source URL but no
 * rehosted URL yet. Accepting a printing kicks off rehosting as a fire-and-
 * forget background job, so the accept response lands with `rehostedUrl` still
 * null; polling until it fills in lets the view upgrade to the self-hosted
 * image on its own. Images without an `originalUrl` can never be rehosted, so
 * they are ignored to avoid polling forever.
 * @returns true when at least one image is still awaiting rehosting
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
