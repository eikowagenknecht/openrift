import type {
  CardTradeActionCountsResponse,
  CardTradeListResponse,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchUserTrades = createServerFn({ method: "GET" })
  .inputValidator((input: { groupId?: string; status?: string } | undefined) => input ?? {})
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardTradeListResponse> => {
    const params = new URLSearchParams();
    if (data.groupId !== undefined) {
      params.set("groupId", data.groupId);
    }
    if (data.status !== undefined) {
      params.set("status", data.status);
    }
    const query = params.toString();
    return fetchApiJson<CardTradeListResponse>({
      errorTitle: "Couldn't load trades",
      cookie: context.cookie,
      path: query === "" ? "/api/v1/trades" : `/api/v1/trades?${query}`,
    });
  });

const fetchTradeActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CardTradeActionCountsResponse> =>
      fetchApiJson<CardTradeActionCountsResponse>({
        errorTitle: "Couldn't load trade activity",
        cookie: context.cookie,
        path: "/api/v1/trades/action-counts",
      }),
  );

// ── Server functions: mutations ───────────────────────────────────────────────

const createTradeFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      groupSlug: string;
      counterpartyUserId: string;
      role: CardTradeRole;
      printingId: string;
      quantity: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<CardTradeResponse>({
      errorTitle: "Couldn't send the trade",
      cookie: context.cookie,
      path: "/api/v1/trades",
      method: "POST",
      body: data,
    }),
  );

const tradeActionFn = createServerFn({ method: "POST" })
  .inputValidator((input: { tradeId: string; action: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<CardTradeResponse>({
      errorTitle: "Couldn't update the trade",
      cookie: context.cookie,
      path: `/api/v1/trades/${encodeURIComponent(data.tradeId)}/${data.action}`,
      method: "POST",
    }),
  );

const applyTradeSyncFn = createServerFn({ method: "POST" })
  .inputValidator((input: { tradeId: string; targetCollectionId?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<CardTradeResponse>({
      errorTitle: "Couldn't apply your changes",
      cookie: context.cookie,
      path: `/api/v1/trades/${encodeURIComponent(data.tradeId)}/sync`,
      method: "POST",
      body: { targetCollectionId: data.targetCollectionId },
    }),
  );

const skipTradeSyncFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tradeId }) =>
    fetchApiJson<CardTradeResponse>({
      errorTitle: "Couldn't skip your changes",
      cookie: context.cookie,
      path: `/api/v1/trades/${encodeURIComponent(tradeId)}/sync/skip`,
      method: "POST",
    }),
  );

// ── Query hooks ───────────────────────────────────────────────────────────────

/**
 * The viewer's trades in one group (for the per-group Trades tab).
 * @returns The group-trades query.
 */
export function useGroupTrades(groupId: string) {
  const userId = useRequiredUserId();
  return useQuery(
    queryOptions({
      queryKey: queryKeys.trades.byGroup(userId, groupId),
      queryFn: () => fetchUserTrades({ data: { groupId } }),
    }),
  );
}

/**
 * Polled per-group "needs your action" counts for the group badges (header nav,
 * /groups cards, Trades tab). A plain (non-suspense) query so it can live in the
 * header without an authenticated route boundary.
 * @returns The action-counts query (`{ total, byGroup }`).
 */
export function useTradeActionCounts() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.trades.actionCounts(userId ?? ""),
    queryFn: () => fetchTradeActionCounts(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: userId !== null,
  });
}

/**
 * The viewer's recent trades across all groups (bell dropdown + match-row status).
 * @returns The all-trades query.
 */
export function useUserTrades() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.trades.all(userId ?? ""),
    queryFn: () => fetchUserTrades({ data: {} }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: userId !== null,
  });
}

// ── Mutation hooks ──────────────────────────────────────────────────────────

/**
 * Invalidates trades + the affected group's matches (reserved copies changed).
 * @returns The query keys to invalidate.
 */
function tradeInvalidationKeys(userId: string, groupSlug?: string): (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [queryKeys.trades.all(userId)];
  if (groupSlug !== undefined) {
    keys.push(queryKeys.friendGroups.matches(userId, groupSlug));
  }
  return keys;
}

export function useCreateTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    {
      groupSlug: string;
      counterpartyUserId: string;
      role: CardTradeRole;
      printingId: string;
      quantity: number;
    }
  >({
    mutationFn: (data) => createTradeFn({ data }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useAcceptTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "accept" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useDeclineTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "decline" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useCancelTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "cancel" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useCompleteTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "complete" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useApplyTradeSync() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    { tradeId: string; targetCollectionId?: string; groupSlug?: string }
  >({
    mutationFn: (data) =>
      applyTradeSyncFn({
        data: { tradeId: data.tradeId, targetCollectionId: data.targetCollectionId },
      }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

export function useSkipTradeSync() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => skipTradeSyncFn({ data: data.tradeId }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}
