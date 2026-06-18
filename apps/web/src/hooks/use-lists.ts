import type {
  Currency,
  ListBulkAddResponse,
  ListDetailResponse,
  ListEntryResponse,
  ListIntent,
  ListKind,
  ListListResponse,
  ListMoveResponse,
  ListResponse,
  ListShareResponse,
  PublicListDetailResponse,
  TradePreference,
} from "@openrift/shared";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { reorderInPlace } from "@/lib/reorder-in-place";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── LIST ─────────────────────────────────────────────────────────────────────

const fetchLists = createServerFn({ method: "GET" })
  .validator((input: { intent?: ListIntent } | undefined) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists.$get({
          // The route declares a query schema (`intent` optional), so hc requires
          // the `query` arg even when empty; `{}` sends no `intent`.
          query: data?.intent ? { intent: data.intent } : {},
        }),
        "Couldn't load lists",
      ),
  );

const fetchListDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }): Promise<ListDetailResponse> => {
    const res = await callApi(
      serverApiClient(context.cookie).api.v1.lists[":id"].$get({
        param: encodeParams({ id: listId }),
      }),
      "Couldn't load list",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<ListDetailResponse>;
  });

export function listsQueryOptions(userId: string, intent?: ListIntent) {
  return queryOptions({
    queryKey: queryKeys.lists.all(userId, intent),
    queryFn: () => fetchLists({ data: intent ? { intent } : undefined }),
    select: (data: ListListResponse) => data.items,
    staleTime: 5 * 60 * 1000,
  });
}

export function listDetailQueryOptions(userId: string, listId: string) {
  return queryOptions({
    queryKey: queryKeys.lists.detail(userId, listId),
    queryFn: () => fetchListDetail({ data: listId }),
  });
}

export function useLists(intent?: ListIntent) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(listsQueryOptions(userId, intent));
}

export function useListDetail(listId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(listDetailQueryOptions(userId, listId));
}

// ── MUTATIONS ────────────────────────────────────────────────────────────────

interface CreateListInput {
  name: string;
  intent: ListIntent;
  kind: ListKind;
  /** ADR-017: list-level trade defaults. Ignored on organize lists. */
  tradeDefaults?: TradePreference;
  /** ADR-017: list currency. Required when any 'absolute' preference is set. */
  currency?: Currency | null;
}

const createListFn = createServerFn({ method: "POST" })
  .validator((input: CreateListInput) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists.$post({
          json: data,
        }),
        "Couldn't create list",
      ),
  );

export function useCreateList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: CreateListInput) => createListFn({ data: body }),
    // Invalidate the un-filtered key plus the intent-filtered key so both
    // the "all lists" and the per-intent sidebar groups refresh.
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.all(userId, variables.intent),
    ],
  });
}

interface UpdateListInput {
  listId: string;
  name?: string;
  tradeDefaults?: TradePreference;
  currency?: Currency | null;
}

const updateListFn = createServerFn({ method: "POST" })
  .validator((input: UpdateListInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListResponse> => {
    const { listId, ...fields } = data;
    return callApiJson(
      serverApiClient(context.cookie).api.v1.lists[":id"].$patch({
        param: encodeParams({ id: listId }),
        json: fields,
      }),
      "Couldn't update list",
    );
  });

export function useUpdateList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<ListResponse, UpdateListInput>({
    mutationFn: (input) => updateListFn({ data: input }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.listId),
    ],
  });
}

const deleteListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.lists[":id"].$delete({
        param: encodeParams({ id: listId }),
      }),
      "Couldn't delete list",
    );
  });

export function useDeleteList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (listId) => deleteListFn({ data: listId }),
    invalidates: [queryKeys.lists.all(userId)],
  });
}

const reorderListsFn = createServerFn({ method: "POST" })
  .validator((input: { intent: ListIntent; orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.lists.reorder.$post({
        json: data,
      }),
      "Couldn't reorder lists",
    );
  });

/**
 * Reorders the user's lists within one intent bucket. Lists from other
 * intents stay where they are in the cache. On error we restore the
 * snapshot we took in `onMutate`.
 *
 * @returns A mutation that takes `{ intent, orderedIds }` and reorders the
 *   matching intent bucket in the sidebar.
 */
export function useReorderLists() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { intent: ListIntent; orderedIds: string[] },
    { previous: ListListResponse | undefined }
  >({
    mutationFn: (variables) => reorderListsFn({ data: variables }),
    onMutate: ({ orderedIds }) => {
      const key = queryKeys.lists.all(userId);
      const previous = queryClient.getQueryData<ListListResponse>(key);
      if (previous) {
        queryClient.setQueryData<ListListResponse>(key, {
          ...previous,
          items: reorderInPlace(previous.items, orderedIds),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.lists.all(userId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
    },
  });
}

// ── ENTRIES ──────────────────────────────────────────────────────────────────

const bulkAddEntriesFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      listId: string;
      entries: {
        cardId?: string;
        printingId?: string;
        copyId?: string;
        quantity?: number;
      }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListBulkAddResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists[":id"].entries.bulk.$post({
          param: encodeParams({ id: data.listId }),
          json: { entries: data.entries },
        }),
        "Couldn't add to list",
      ),
  );

interface BulkAddVariables {
  listId: string;
  entries: {
    cardId?: string;
    printingId?: string;
    copyId?: string;
    quantity?: number;
  }[];
}

export function useBulkAddListEntries() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    ListBulkAddResponse,
    Error,
    BulkAddVariables,
    { prev: ListDetailResponse | undefined }
  >({
    mutationFn: (vars) => bulkAddEntriesFn({ data: vars }),
    // Optimistic update: bump the quantity of any matching existing entry
    // *before* the server responds, so rapid +/- clicks render the new value
    // immediately. Fresh adds (no matching entry yet) wait for the refetch —
    // we don't have card/printing detail on the variables to fabricate a
    // synthetic entry, and the 0 → 1 transition isn't visually jarring the
    // way a backwards n+1 → n flicker is.
    onMutate: async (vars) => {
      const detailKey = queryKeys.lists.detail(userId, vars.listId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const prev = queryClient.getQueryData<ListDetailResponse>(detailKey);
      queryClient.setQueryData<ListDetailResponse>(detailKey, (old) => {
        if (!old) {
          return old;
        }
        let entries = old.entries;
        for (const item of vars.entries) {
          const delta = item.quantity ?? 1;
          const idx = entries.findIndex((entry) => {
            if (item.cardId !== undefined && entry.kind === "card") {
              return entry.cardId === item.cardId;
            }
            if (item.printingId !== undefined && entry.kind === "printing") {
              return entry.printingId === item.printingId;
            }
            if (item.copyId !== undefined && entry.kind === "copy") {
              return entry.copyId === item.copyId;
            }
            return false;
          });
          if (idx !== -1) {
            const existing = entries[idx];
            entries = [
              ...entries.slice(0, idx),
              { ...existing, quantity: existing.quantity + delta },
              ...entries.slice(idx + 1),
            ];
          }
        }
        return { ...old, entries };
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKeys.lists.detail(userId, vars.listId), context.prev);
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(userId, vars.listId) });
    },
  });
}

// Drag-from-collections sugar. The server derives the right entry shape from
// the list's kind, so the client just passes raw copy IDs.
const bulkAddCopiesToListFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListBulkAddResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists[":id"].entries["from-copies"].$post({
          param: encodeParams({ id: data.listId }),
          json: { copyIds: data.copyIds },
        }),
        "Couldn't add to list",
      ),
  );

export function useBulkAddCopiesToList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<ListBulkAddResponse, { listId: string; copyIds: string[] }>({
    mutationFn: (vars) => bulkAddCopiesToListFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.listId),
    ],
  });
}

// List-to-list move. The server enforces same-kind + same-intent + same-user.
// We invalidate both list details + the lists index so the source's grid
// drops the entries and the destination's gains them.
const moveListEntriesFn = createServerFn({ method: "POST" })
  .validator((input: { fromListId: string; toListId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<ListMoveResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists[":id"].entries.move.$post({
          param: encodeParams({ id: data.fromListId }),
          json: { toListId: data.toListId, entryIds: data.entryIds },
        }),
        "Couldn't move entries",
      ),
  );

export function useMoveListEntries() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<
    ListMoveResponse,
    { fromListId: string; toListId: string; entryIds: string[] }
  >({
    mutationFn: (vars) => moveListEntriesFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.fromListId),
      queryKeys.lists.detail(userId, variables.toListId),
    ],
  });
}

interface UpdateListEntryInput {
  listId: string;
  entryId: string;
  quantity?: number;
  /** ADR-017 per-entry override. NULL fields fall through to list defaults. */
  tradeOverride?: TradePreference;
}

const updateListEntryFn = createServerFn({ method: "POST" })
  .validator((input: UpdateListEntryInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListEntryResponse> => {
    const { listId, entryId, ...fields } = data;
    return callApiJson(
      serverApiClient(context.cookie).api.v1.lists[":id"].entries[":itemId"].$patch({
        param: encodeParams({ id: listId, itemId: entryId }),
        json: fields,
      }),
      "Couldn't update list entry",
    );
  });

export function useUpdateListEntry() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    ListEntryResponse,
    Error,
    UpdateListEntryInput,
    { prev: ListDetailResponse | undefined }
  >({
    mutationFn: (vars) => updateListEntryFn({ data: vars }),
    // Same optimistic-update pattern as useBulkAddListEntries — update the
    // entry's quantity/override in the cache immediately so the row renders
    // the new values on click, then reconcile via the invalidation in onSettled.
    onMutate: async (vars) => {
      const detailKey = queryKeys.lists.detail(userId, vars.listId);
      await queryClient.cancelQueries({ queryKey: detailKey });
      const prev = queryClient.getQueryData<ListDetailResponse>(detailKey);
      queryClient.setQueryData<ListDetailResponse>(detailKey, (old) => {
        if (!old) {
          return old;
        }
        return {
          ...old,
          entries: old.entries.map((entry) =>
            entry.id === vars.entryId
              ? {
                  ...entry,
                  ...(vars.quantity !== undefined && { quantity: vars.quantity }),
                  ...(vars.tradeOverride !== undefined && { tradeOverride: vars.tradeOverride }),
                }
              : entry,
          ),
        };
      });
      return { prev };
    },
    onError: (_err, vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKeys.lists.detail(userId, vars.listId), context.prev);
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(userId, vars.listId) });
    },
  });
}

const removeListEntryFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.lists[":id"].entries[":itemId"].$delete({
        param: encodeParams({ id: data.listId, itemId: data.entryId }),
      }),
      "Couldn't remove from list",
    );
  });

export function useRemoveListEntry() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { listId: string; entryId: string }>({
    mutationFn: (vars) => removeListEntryFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.listId),
    ],
  });
}

const bulkRemoveListEntriesFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.lists[":id"].entries["bulk-delete"].$post({
        param: encodeParams({ id: data.listId }),
        json: { entryIds: data.entryIds },
      }),
      "Couldn't remove from list",
    );
  });

export function useBulkRemoveListEntries() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, { listId: string; entryIds: string[] }>({
    mutationFn: (vars) => bulkRemoveListEntriesFn({ data: vars }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.detail(userId, variables.listId),
    ],
  });
}

// ── SHARING ──────────────────────────────────────────────────────────────────

const shareListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: listId }): Promise<ListShareResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.lists[":id"].share.$post({
          param: encodeParams({ id: listId }),
        }),
        "Couldn't share list",
      ),
  );

export function useShareList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => shareListFn({ data: listId }),
    onSuccess: (data, listId) => {
      queryClient.setQueryData<ListDetailResponse>(queryKeys.lists.detail(userId, listId), (old) =>
        old
          ? {
              ...old,
              list: { ...old.list, shareToken: data.shareToken, isPublic: data.isPublic },
            }
          : old,
      );
    },
  });
}

const unshareListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.lists[":id"].share.$delete({
        param: encodeParams({ id: listId }),
      }),
      "Couldn't unshare list",
    );
  });

export function useUnshareList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => unshareListFn({ data: listId }),
    onSuccess: (_, listId) => {
      queryClient.setQueryData<ListDetailResponse>(queryKeys.lists.detail(userId, listId), (old) =>
        old ? { ...old, list: { ...old.list, shareToken: null, isPublic: false } } : old,
      );
    },
  });
}

const fetchPublicListFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicListDetailResponse> => {
    const res = await callApi(
      serverApiClient().api.v1.lists.share[":token"].$get({
        param: encodeParams({ token }),
      }),
      "Couldn't load shared list",
      [404],
    );
    if ((res.status as number) === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<PublicListDetailResponse>;
  });

export function publicListQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.lists.publicByToken(token),
    queryFn: () => fetchPublicListFn({ data: token }),
  });
}

export function usePublicList(token: string) {
  return useSuspenseQuery(publicListQueryOptions(token));
}
