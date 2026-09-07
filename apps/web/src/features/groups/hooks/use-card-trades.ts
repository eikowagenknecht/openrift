import { cardTradesContract } from "@openrift/shared/contracts/card-trades";
import type {
  CardTradeCopyOptionsResponse,
  CardTradeLiveAnnotation,
  CardTradeResponse,
  CardTradeRole,
  CardTradeSheetResponse,
  CardTradeStatus,
} from "@openrift/shared/types/api/card-trade";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

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
    return apiOrpcClient(cardTradesContract, context.cookie).list(query);
  });

const fetchTradeActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(cardTradesContract, context.cookie).actionCounts());

const fetchLiveTradesByPrinting = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(cardTradesContract, context.cookie).liveByPrinting());

const fetchTradeSheet = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: memberId }): Promise<CardTradeSheetResponse> =>
    apiOrpcClient(cardTradesContract, context.cookie).withUser({ userId: memberId }),
  );

const fetchTradeCopyOptions = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tradeId }): Promise<CardTradeCopyOptionsResponse> =>
    apiOrpcClient(cardTradesContract, context.cookie).copyOptions({ id: tradeId }),
  );

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
  .handler(({ context, data }) => apiOrpcClient(cardTradesContract, context.cookie).create(data));

const setTradeQuantityFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; quantity: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardTradeResponse> =>
    apiOrpcClient(cardTradesContract, context.cookie).setQuantity({
      id: data.tradeId,
      quantity: data.quantity,
    }),
  );

const tradeActionFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; action: "decline" | "cancel" }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardTradeResponse> =>
    // decline/cancel share one { id } -> CardTradeResponse shape; accept is separate
    // because it also carries the giver's copy choice.
    apiOrpcClient(cardTradesContract, context.cookie)[data.action]({ id: data.tradeId }),
  );

const acceptTradeFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; copyIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CardTradeResponse> =>
    apiOrpcClient(cardTradesContract, context.cookie).accept({
      id: data.tradeId,
      copyIds: data.copyIds,
    }),
  );

const applyTradeSyncFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tradeId: string;
      targetCollectionId?: string;
      copyIds?: string[];
      quantity?: number;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(cardTradesContract, context.cookie).sync({
      id: data.tradeId,
      targetCollectionId: data.targetCollectionId,
      copyIds: data.copyIds,
      quantity: data.quantity,
    }),
  );

const skipTradeSyncFn = createServerFn({ method: "POST" })
  .validator((input: { tradeId: string; quantity?: number }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(cardTradesContract, context.cookie).skipSync({
      id: data.tradeId,
      quantity: data.quantity,
    }),
  );

export function useGroupTrades(groupId: string) {
  const userId = useRequiredUserId();
  return useQuery(
    queryOptions({
      queryKey: queryKeys.trades.byGroup(userId, groupId),
      queryFn: () => fetchUserTrades({ data: { groupId } }),
    }),
  );
}

/** A plain (non-suspense) query so it can live in the header without an authenticated route boundary. */
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

/** Shared by the card browsers' trade markers and the deck builder's incoming counts, so both read one cached response. */
function liveTradesByPrintingQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.trades.liveByPrinting(userId),
    queryFn: () => fetchLiveTradesByPrinting(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Deliberately not polled: `refetchInterval` is per-observer, and a card-browser
 * cell mounts this hook once per visible card, so a poll would arm one timer per cell.
 */
export function useLiveTradesByPrinting() {
  const userId = useUserId();
  return useQuery({
    ...liveTradesByPrintingQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });
}

/**
 * Only the `reserved` phase counts: it is the only phase that pins a copy, so it's
 * the only one that can't promise stock that never arrives.
 */
export function aggregateIncomingTradeCounts(
  annotations: readonly CardTradeLiveAnnotation[],
): Record<string, number> {
  const incoming: Record<string, number> = {};
  for (const annotation of annotations) {
    if (annotation.role !== "receiver" || annotation.phase !== "reserved") {
      continue;
    }
    incoming[annotation.printingId] = (incoming[annotation.printingId] ?? 0) + annotation.quantity;
  }
  return incoming;
}

/** The underlying query drops a settled side immediately, so there is no window where a card counts as both incoming and a real copy. */
export function useIncomingTradeCounts(enabled: boolean): {
  data: Record<string, number> | undefined;
} {
  const userId = useUserId();
  const { data } = useQuery({
    ...liveTradesByPrintingQueryOptions(userId ?? ""),
    enabled: enabled && userId !== null,
  });
  if (!enabled || data === undefined) {
    return { data: undefined };
  }
  return { data: aggregateIncomingTradeCounts(data.annotations) };
}

export function tradeSheetQueryOptions(userId: string, memberId: string) {
  return queryOptions({
    queryKey: queryKeys.trades.sheet(userId, memberId),
    queryFn: () => fetchTradeSheet({ data: memberId }),
  });
}

/**
 * Deliberately not polled: the live trades this page also renders come from
 * {@link useUserTrades}, and every trade mutation invalidates this key via the shared `trades` prefix.
 */
export function useTradeSheet(memberId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tradeSheetQueryOptions(userId, memberId));
}

/**
 * Must be pulled via `query()` at Accept time, not a mounted `useQuery`, so
 * a reopened picker never sees a stale, already-claimed copy list.
 */
export function tradeCopyOptionsQueryOptions(userId: string, tradeId: string) {
  return queryOptions({
    queryKey: queryKeys.trades.copyOptions(userId, tradeId),
    queryFn: () => fetchTradeCopyOptions({ data: tradeId }),
  });
}

/**
 * `copies.syncedStore` only refetches when `copies.all` is also invalidated;
 * both keys are required. `trades.all`/`lists.all` are prefix matches for their nested keys.
 */
function tradeInvalidationKeys(userId: string, groupSlug?: string): (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [
    queryKeys.trades.all(userId),
    queryKeys.copies.all(userId),
    queryKeys.copies.syncedStore(userId),
    queryKeys.lists.all(userId),
  ];
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

export function useSetTradeQuantity() {
  // Mounted by the public `/lists/share/$token` route for anonymous viewers, so it
  // must not require a session at render; `userId` is read only for the success-time
  // invalidation keys, where the mutation never runs without a real id.
  const userId = useUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    { tradeId: string; quantity: number; groupSlug?: string }
  >({
    mutationFn: (data) =>
      setTradeQuantityFn({ data: { tradeId: data.tradeId, quantity: data.quantity } }),
    invalidates: (variables) => tradeInvalidationKeys(userId ?? "", variables.groupSlug),
  });
}

export function useAcceptTrade() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    { tradeId: string; groupSlug?: string; copyIds?: string[] }
  >({
    mutationFn: (data) => acceptTradeFn({ data: { tradeId: data.tradeId, copyIds: data.copyIds } }),
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
  // Mounted by the public shared-list route too (see useSetTradeQuantity).
  const userId = useUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "cancel" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId ?? "", variables.groupSlug),
  });
}

/** `quantity` settles only part of the row, leaving the rest in flight as a trade of its own; omitted, the whole row settles. */
export function useApplyTradeSync() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    {
      tradeId: string;
      targetCollectionId?: string;
      copyIds?: string[];
      quantity?: number;
      groupSlug?: string;
    }
  >({
    mutationFn: (data) =>
      applyTradeSyncFn({
        data: {
          tradeId: data.tradeId,
          targetCollectionId: data.targetCollectionId,
          copyIds: data.copyIds,
          quantity: data.quantity,
        },
      }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}

/** Takes the same `quantity` semantics as {@link useApplyTradeSync}. */
export function useSkipTradeSync() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    CardTradeResponse,
    { tradeId: string; quantity?: number; groupSlug?: string }
  >({
    mutationFn: (data) =>
      skipTradeSyncFn({ data: { tradeId: data.tradeId, quantity: data.quantity } }),
    invalidates: (variables) => tradeInvalidationKeys(userId, variables.groupSlug),
  });
}
