import type { CardTradeResponse, CardTradeRole, CardTradeStatus } from "@openrift/shared";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── Server functions: queries ───────────────────────────────────────────────

const fetchUserTrades = createServerFn({ method: "GET" })
  .validator((input: { groupId?: string; status?: CardTradeStatus } | undefined) => input ?? {})
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const query: { groupId?: string; status?: CardTradeStatus } = {};
    if (data.groupId !== undefined) {
      query.groupId = data.groupId;
    }
    if (data.status !== undefined) {
      query.status = data.status;
    }
    return callApiJson(
      serverApiClient(context.cookie).api.v1.trades.$get({ query }),
      "Couldn't load trades",
    );
  });

const fetchTradeActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) =>
    callApiJson(
      serverApiClient(context.cookie).api.v1.trades["action-counts"].$get(),
      "Couldn't load trade activity",
    ),
  );

// ── Server functions: mutations ───────────────────────────────────────────────

const createTradeFn = createServerFn({ method: "POST" })
  .validator(
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
    callApiJson(
      serverApiClient(context.cookie).api.v1.trades.$post({ json: data }),
      "Couldn't send the trade",
    ),
  );

const setTradeQuantityFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; quantity: number }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<CardTradeResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.trades[":id"].quantity.$post({
          param: encodeParams({ id: data.tradeId }),
          json: { quantity: data.quantity },
        }),
        "Couldn't update the request",
      ),
  );

const tradeActionFn = createServerFn({ method: "POST" })
  .validator(
    (input: { tradeId: string; action: "accept" | "decline" | "cancel" | "complete" }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardTradeResponse> => {
    const trade = serverApiClient(context.cookie).api.v1.trades[":id"];
    const param = encodeParams({ id: data.tradeId });
    const errorTitle = "Couldn't update the trade";
    switch (data.action) {
      case "accept": {
        return callApiJson(trade.accept.$post({ param }), errorTitle);
      }
      case "decline": {
        return callApiJson(trade.decline.$post({ param }), errorTitle);
      }
      case "cancel": {
        return callApiJson(trade.cancel.$post({ param }), errorTitle);
      }
      case "complete": {
        return callApiJson(trade.complete.$post({ param }), errorTitle);
      }
    }
  });

const applyTradeSyncFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; targetCollectionId?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    callApiJson(
      serverApiClient(context.cookie).api.v1.trades[":id"].sync.$post({
        param: encodeParams({ id: data.tradeId }),
        json: { targetCollectionId: data.targetCollectionId },
      }),
      "Couldn't apply your changes",
    ),
  );

const skipTradeSyncFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tradeId }) =>
    callApiJson(
      serverApiClient(context.cookie).api.v1.trades[":id"].sync.skip.$post({
        param: encodeParams({ id: tradeId }),
      }),
      "Couldn't skip your changes",
    ),
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

/**
 * Resizes a pending request to a new total quantity (per-copy claim/release on a
 * member's tradelist). Invalidates the same keys as create so the tradelist
 * markers and the Trades page both refresh.
 * @returns The set-quantity mutation.
 */
export function useSetTradeQuantity() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    { tradeId: string; quantity: number; groupSlug?: string }
  >({
    mutationFn: (data) =>
      setTradeQuantityFn({ data: { tradeId: data.tradeId, quantity: data.quantity } }),
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
