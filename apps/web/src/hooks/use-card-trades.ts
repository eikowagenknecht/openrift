import type {
  CardTradeCopyOptionsResponse,
  CardTradeResponse,
  CardTradeRole,
  CardTradeStatus,
} from "@openrift/shared";
import { cardTradesContract } from "@openrift/shared/contracts/card-trades";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
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
    return apiOrpcClient(cardTradesContract, context.cookie).list(query);
  });

const fetchTradeActionCounts = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(cardTradesContract, context.cookie).actionCounts());

const fetchLiveTradesByPrinting = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => apiOrpcClient(cardTradesContract, context.cookie).liveByPrinting());

const fetchTradeCopyOptions = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tradeId }): Promise<CardTradeCopyOptionsResponse> =>
    apiOrpcClient(cardTradesContract, context.cookie).copyOptions({ id: tradeId }),
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
    // decline/cancel share the same { id } → CardTradeResponse shape, so index
    // the client by the action name. Accept has its own function below because
    // it carries the giver's copy choice.
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
  .validator((input: { tradeId: string; targetCollectionId?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(cardTradesContract, context.cookie).sync({
      id: data.tradeId,
      targetCollectionId: data.targetCollectionId,
    }),
  );

const skipTradeSyncFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: tradeId }) =>
    apiOrpcClient(cardTradesContract, context.cookie).skipSync({ id: tradeId }),
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

/**
 * The viewer's live trades across all groups, summed per (printing, role,
 * phase), for the card browsers' per-card trade markers.
 *
 * Deliberately not polled. A card-browser cell mounts this hook once per
 * visible card, and `refetchInterval` is per-observer in query-core, so a poll
 * here would arm one timer per cell instead of one per app. A stale window
 * plus the trade mutations' own invalidation covers everything the user does
 * themselves; a counterparty's accept lands on the next refocus.
 * @returns The live-annotations query.
 */
export function useLiveTradesByPrinting() {
  const userId = useUserId();
  return useQuery({
    queryKey: queryKeys.trades.liveByPrinting(userId ?? ""),
    queryFn: () => fetchLiveTradesByPrinting(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: userId !== null,
  });
}

/**
 * The candidate copies behind one pending trade, in the server's default pin
 * order, for the giver's copy picker.
 *
 * Deliberately not a mounted `useQuery`: the route re-reads the giver's supply,
 * which for a member with a dynamic trade list assembles the whole rule
 * catalogue. It must run once per opened picker, never on a render and never on
 * a poll, so the accept flow pulls it through `fetchQuery` at the moment the
 * giver presses Accept and nothing subscribes to it. `fetchQuery` on a
 * zero-`staleTime` key always goes to the network, so a picker reopened after
 * another accept sees the copies that are still free rather than a cached list.
 * @returns The copy-options query options.
 */
export function tradeCopyOptionsQueryOptions(userId: string, tradeId: string) {
  return queryOptions({
    queryKey: queryKeys.trades.copyOptions(userId, tradeId),
    queryFn: () => fetchTradeCopyOptions({ data: tradeId }),
  });
}

// ── Mutation hooks ──────────────────────────────────────────────────────────

/**
 * Trade mutations pin/release copies, which changes the `reserved` flag on the
 * copies feed and on any list that copy belongs to, so every trade mutation
 * also resyncs the client-side copies store and the lists cache (Reserved
 * badges). That takes both copies keys: `copies.all` marks the shared
 * response cache stale, and `copies.syncedStore` makes the react-db
 * collection's own query refetch through it (its queryFn only hits the
 * network when the shared cache is stale). `lists.all` is a prefix match, so
 * it also covers `lists.detail` for the same reason. The server picks which
 * copies get reserved or released, so there is nothing to write
 * optimistically.
 *
 * `trades.all` is a prefix match too, so it already refreshes the card
 * browsers' per-printing annotations (`trades.liveByPrinting`) — that key
 * needs no entry of its own here, and `query-keys.test.ts` locks the nesting
 * that makes it true.
 * @returns The query keys to invalidate.
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

/**
 * Resizes a pending request to a new total quantity (per-copy claim/release on a
 * member's tradelist). Invalidates the same keys as create so the tradelist
 * markers and the Trades page both refresh.
 * @returns The set-quantity mutation.
 */
export function useSetTradeQuantity() {
  // The public `/lists/share/$token` route mounts this hook for anonymous
  // viewers (the mutation only ever fires in authenticated friend-group
  // request mode). It therefore must not require a session at render —
  // `useRequiredUserId` would throw. `userId` is read only to build the
  // success-time invalidation keys, where the mutation never runs without a
  // real id, so the `?? ""` fallback is unreachable in practice.
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

/**
 * Accepts a pending trade. When the viewer is the giver they may name the exact
 * copies to promise via `copyIds` (see `tradeCopyOptionsQueryOptions`); omitting
 * it lets the server pin the plainest copies itself, which is what every
 * receiver-side accept does.
 * @returns The accept mutation.
 */
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
  // Mounted by the public shared-list route too (see useSetTradeQuantity): use
  // the nullable session id so an anonymous render does not throw.
  const userId = useUserId();
  return useMutationWithInvalidation<CardTradeResponse, { tradeId: string; groupSlug?: string }>({
    mutationFn: (data) => tradeActionFn({ data: { tradeId: data.tradeId, action: "cancel" } }),
    invalidates: (variables) => tradeInvalidationKeys(userId ?? "", variables.groupSlug),
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
