import type {
  PublicTradeListDetailResponse,
  TradeListBulkAddResponse,
  TradeListDetailResponse,
  TradeListListResponse,
  TradeListResponse,
  TradeListShareResponse,
} from "@openrift/shared";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchTradeLists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<TradeListListResponse> =>
      fetchApiJson<TradeListListResponse>({
        errorTitle: "Couldn't load trade lists",
        cookie: context.cookie,
        path: "/api/v1/trade-lists",
      }),
  );

const fetchTradeListDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: tradeListId }): Promise<TradeListDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(tradeListId)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<TradeListDetailResponse>;
  });

function tradeListsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.tradeLists.all(userId),
    queryFn: () => fetchTradeLists(),
    select: (data: TradeListListResponse) => data.items,
    staleTime: 5 * 60 * 1000,
  });
}

export function tradeListDetailQueryOptions(userId: string, tradeListId: string) {
  return queryOptions({
    queryKey: queryKeys.tradeLists.detail(userId, tradeListId),
    queryFn: () => fetchTradeListDetail({ data: tradeListId }),
  });
}

export function useTradeLists() {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tradeListsQueryOptions(userId));
}

export function useTradeListDetail(tradeListId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(tradeListDetailQueryOptions(userId, tradeListId));
}

const createTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<TradeListResponse>({
      errorTitle: "Couldn't create trade list",
      cookie: context.cookie,
      path: "/api/v1/trade-lists",
      method: "POST",
      body: data,
    }),
  );

export function useCreateTradeList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { name: string }) => createTradeListFn({ data: body }),
    invalidates: [queryKeys.tradeLists.all(userId)],
  });
}

const updateTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: { tradeListId: string; name?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { tradeListId, ...fields } = data;
    return fetchApiJson<TradeListResponse>({
      errorTitle: "Couldn't update trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(tradeListId)}`,
      method: "PATCH",
      body: fields,
    });
  });

export function useUpdateTradeList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TradeListResponse, { tradeListId: string; name?: string }>({
    mutationFn: ({ tradeListId, name }) => updateTradeListFn({ data: { tradeListId, name } }),
    invalidates: (variables) => [
      queryKeys.tradeLists.all(userId),
      queryKeys.tradeLists.detail(userId, variables.tradeListId),
    ],
  });
}

const deleteTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: tradeListId }) => {
    await fetchApi({
      errorTitle: "Couldn't delete trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(tradeListId)}`,
      method: "DELETE",
    });
  });

export function useDeleteTradeList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (tradeListId) => deleteTradeListFn({ data: tradeListId }),
    invalidates: [queryKeys.tradeLists.all(userId)],
  });
}

const addCopiesToTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: { tradeListId: string; copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<TradeListBulkAddResponse>({
      errorTitle: "Couldn't add to trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(data.tradeListId)}/items/bulk`,
      method: "POST",
      body: { copyIds: data.copyIds },
    }),
  );

export function useAddCopiesToTradeList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    TradeListBulkAddResponse,
    { tradeListId: string; copyIds: string[] }
  >({
    mutationFn: (vars) => addCopiesToTradeListFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.tradeLists.all(userId),
      queryKeys.tradeLists.detail(userId, variables.tradeListId),
    ],
  });
}

const removeTradeListItemFn = createServerFn({ method: "POST" })
  .inputValidator((input: { tradeListId: string; itemId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't remove from trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(data.tradeListId)}/items/${encodeURIComponent(data.itemId)}`,
      method: "DELETE",
    });
  });

export function useRemoveTradeListItem() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { tradeListId: string; itemId: string }>({
    mutationFn: (vars) => removeTradeListItemFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.tradeLists.all(userId),
      queryKeys.tradeLists.detail(userId, variables.tradeListId),
    ],
  });
}

// ── Trade list sharing ──────────────────────────────────────────────────────

const shareTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: tradeListId }): Promise<TradeListShareResponse> =>
      fetchApiJson<TradeListShareResponse>({
        errorTitle: "Couldn't share trade list",
        cookie: context.cookie,
        path: `/api/v1/trade-lists/${encodeURIComponent(tradeListId)}/share`,
        method: "POST",
      }),
  );

export function useShareTradeList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tradeListId: string) => shareTradeListFn({ data: tradeListId }),
    onSuccess: (data, tradeListId) => {
      queryClient.setQueryData<TradeListDetailResponse>(
        queryKeys.tradeLists.detail(userId, tradeListId),
        (old) =>
          old ? { ...old, tradeList: { ...old.tradeList, shareToken: data.shareToken } } : old,
      );
    },
  });
}

const unshareTradeListFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: tradeListId }) => {
    await fetchApi({
      errorTitle: "Couldn't unshare trade list",
      cookie: context.cookie,
      path: `/api/v1/trade-lists/${encodeURIComponent(tradeListId)}/share`,
      method: "DELETE",
    });
  });

export function useUnshareTradeList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tradeListId: string) => unshareTradeListFn({ data: tradeListId }),
    onSuccess: (_, tradeListId) => {
      queryClient.setQueryData<TradeListDetailResponse>(
        queryKeys.tradeLists.detail(userId, tradeListId),
        (old) => (old ? { ...old, tradeList: { ...old.tradeList, shareToken: null } } : old),
      );
    },
  });
}

const fetchPublicTradeListFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicTradeListDetailResponse> => {
    // 404 is legitimate (unknown/revoked token) — map to NOT_FOUND without logging.
    const res = await fetchApi({
      errorTitle: "Couldn't load shared trade list",
      path: `/api/v1/trade-lists/share/${encodeURIComponent(token)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PublicTradeListDetailResponse>;
  });

export function publicTradeListQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.tradeLists.publicByToken(token),
    queryFn: () => fetchPublicTradeListFn({ data: token }),
  });
}

export function usePublicTradeList(token: string) {
  return useSuspenseQuery(publicTradeListQueryOptions(token));
}
