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
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── LIST ─────────────────────────────────────────────────────────────────────

const fetchLists = createServerFn({ method: "GET" })
  .inputValidator((input: { intent?: ListIntent } | undefined) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListListResponse> => {
    const query = data?.intent ? `?intent=${encodeURIComponent(data.intent)}` : "";
    return fetchApiJson<ListListResponse>({
      errorTitle: "Couldn't load lists",
      cookie: context.cookie,
      path: `/api/v1/lists${query}`,
    });
  });

const fetchListDetail = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }): Promise<ListDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(listId)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
      throw new Error("NOT_FOUND");
    }
    return res.json() as Promise<ListDetailResponse>;
  });

function listsQueryOptions(userId: string, intent?: ListIntent) {
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
  .inputValidator((input: CreateListInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<ListResponse>({
      errorTitle: "Couldn't create list",
      cookie: context.cookie,
      path: "/api/v1/lists",
      method: "POST",
      body: data,
    }),
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
  .inputValidator((input: UpdateListInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { listId, ...fields } = data;
    return fetchApiJson<ListResponse>({
      errorTitle: "Couldn't update list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(listId)}`,
      method: "PATCH",
      body: fields,
    });
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
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await fetchApi({
      errorTitle: "Couldn't delete list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(listId)}`,
      method: "DELETE",
    });
  });

export function useDeleteList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (listId) => deleteListFn({ data: listId }),
    invalidates: [queryKeys.lists.all(userId)],
  });
}

// ── ENTRIES ──────────────────────────────────────────────────────────────────

const bulkAddEntriesFn = createServerFn({ method: "POST" })
  .inputValidator(
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
  .handler(({ context, data }) =>
    fetchApiJson<ListBulkAddResponse>({
      errorTitle: "Couldn't add to list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(data.listId)}/entries/bulk`,
      method: "POST",
      body: { entries: data.entries },
    }),
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
  .inputValidator((input: { listId: string; copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<ListBulkAddResponse>({
      errorTitle: "Couldn't add to list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(data.listId)}/entries/from-copies`,
      method: "POST",
      body: { copyIds: data.copyIds },
    }),
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
  .inputValidator((input: { fromListId: string; toListId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<ListMoveResponse>({
      errorTitle: "Couldn't move entries",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(data.fromListId)}/entries/move`,
      method: "POST",
      body: { toListId: data.toListId, entryIds: data.entryIds },
    }),
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
  .inputValidator((input: UpdateListEntryInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { listId, entryId, ...fields } = data;
    return fetchApiJson<ListEntryResponse>({
      errorTitle: "Couldn't update list entry",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(entryId)}`,
      method: "PATCH",
      body: fields,
    });
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
  .inputValidator((input: { listId: string; entryId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't remove from list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(data.listId)}/entries/${encodeURIComponent(data.entryId)}`,
      method: "DELETE",
    });
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

// ── SHARING ──────────────────────────────────────────────────────────────────

const shareListFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: listId }): Promise<ListShareResponse> =>
      fetchApiJson<ListShareResponse>({
        errorTitle: "Couldn't share list",
        cookie: context.cookie,
        path: `/api/v1/lists/${encodeURIComponent(listId)}/share`,
        method: "POST",
      }),
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
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await fetchApi({
      errorTitle: "Couldn't unshare list",
      cookie: context.cookie,
      path: `/api/v1/lists/${encodeURIComponent(listId)}/share`,
      method: "DELETE",
    });
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
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicListDetailResponse> => {
    const res = await fetchApi({
      errorTitle: "Couldn't load shared list",
      path: `/api/v1/lists/share/${encodeURIComponent(token)}`,
      acceptStatuses: [404],
    });
    if (res.status === 404) {
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
