import { listsContract } from "@openrift/shared/contracts/lists";
import { publicListsContract } from "@openrift/shared/contracts/public-lists";
import type {
  ListBulkAddResponse,
  ListDetailResponse,
  ListEntryResponse,
  ListIntent,
  ListListResponse,
  ListMoveResponse,
  ListResponse,
  ListShareResponse,
  PublicListDetailResponse,
} from "@openrift/shared/types/api/list";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { reportMutationError } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { reorderInPlace } from "@/lib/reorder-in-place";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

type CreateListInput = ContractInput<typeof listsContract, "create">;
type UpdateListInput = Omit<ContractInput<typeof listsContract, "update">, "id"> & {
  listId: string;
};
type UpdateListEntryInput = Omit<
  ContractInput<typeof listsContract, "updateEntry">,
  "id" | "itemId"
> & {
  listId: string;
  entryId: string;
};

const fetchLists = createServerFn({ method: "GET" })
  .validator((input: { intent?: ListIntent } | undefined) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListListResponse> =>
    apiOrpcClient(listsContract, context.cookie).list(data?.intent ? { intent: data.intent } : {}),
  );

const fetchListDetail = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }): Promise<ListDetailResponse> => {
    // 404 (unknown list, or one belonging to another user) maps to the
    // NOT_FOUND sentinel the route boundary expects.
    const { error, data } = await safe(
      apiOrpcClient(listsContract, context.cookie).get({ id: listId }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
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

const createListFn = createServerFn({ method: "POST" })
  .validator((input: CreateListInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListResponse> =>
    apiOrpcClient(listsContract, context.cookie).create(data),
  );

export function useCreateList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: CreateListInput) => createListFn({ data: body }),
    invalidates: (variables) => [
      queryKeys.lists.all(userId),
      queryKeys.lists.all(userId, variables.intent),
    ],
  });
}

const updateListFn = createServerFn({ method: "POST" })
  .validator((input: UpdateListInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListResponse> => {
    const { listId, ...fields } = data;
    return apiOrpcClient(listsContract, context.cookie).update({ id: listId, ...fields });
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

export function useSetListSidebarHidden() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    ListResponse,
    Error,
    { listId: string; hidden: boolean },
    { previous: ListListResponse | undefined }
  >({
    mutationFn: ({ listId, hidden }) => updateListFn({ data: { listId, sidebarHidden: hidden } }),
    onMutate: ({ listId, hidden }) => {
      const key = queryKeys.lists.all(userId);
      const previous = queryClient.getQueryData<ListListResponse>(key);
      if (previous) {
        queryClient.setQueryData<ListListResponse>(key, {
          ...previous,
          items: previous.items.map((list) =>
            list.id === listId ? { ...list, sidebarHidden: hidden } : list,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.lists.all(userId), context.previous);
      }
      // Replaces the QueryClient's default onError; report here or the rollback is silent.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
    },
  });
}

const deleteListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: listId }) => {
    await apiOrpcClient(listsContract, context.cookie).remove({ id: listId });
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
    await apiOrpcClient(listsContract, context.cookie).reorder(data);
  });

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
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.lists.all(userId), context.previous);
      }
      // Replaces the QueryClient's default onError; report here or the rollback
      // reverts silently.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
    },
  });
}

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
  .handler(({ context, data }): Promise<ListBulkAddResponse> =>
    apiOrpcClient(listsContract, context.cookie).bulkCreateEntries({
      id: data.listId,
      entries: data.entries,
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
    // Bumps a matching existing entry's quantity before the server responds. Fresh
    // adds wait for the refetch: there's no card/printing detail here to fabricate one.
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
          const existing = entries[idx];
          if (existing !== undefined) {
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
    onError: (err, vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKeys.lists.detail(userId, vars.listId), context.prev);
      }
      // Replaces the QueryClient's default onError; report here or the revert is silent.
      reportMutationError(err, queryClient);
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.all(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.detail(userId, vars.listId) });
    },
  });
}

// The server derives the right entry shape from the list's kind, so the client
// just passes raw copy IDs.
const bulkAddCopiesToListFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; copyIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListBulkAddResponse> =>
    apiOrpcClient(listsContract, context.cookie).bulkAddFromCopies({
      id: data.listId,
      copyIds: data.copyIds,
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

const moveListEntriesFn = createServerFn({ method: "POST" })
  .validator((input: { fromListId: string; toListId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListMoveResponse> =>
    apiOrpcClient(listsContract, context.cookie).moveEntries({
      id: data.fromListId,
      toListId: data.toListId,
      entryIds: data.entryIds,
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

const updateListEntryFn = createServerFn({ method: "POST" })
  .validator((input: UpdateListEntryInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ListEntryResponse> => {
    const { listId, entryId, ...fields } = data;
    return apiOrpcClient(listsContract, context.cookie).updateEntry({
      id: listId,
      itemId: entryId,
      ...fields,
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
    onError: (err, vars, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(queryKeys.lists.detail(userId, vars.listId), context.prev);
      }
      // Replaces the QueryClient's default onError; report here or the revert is silent.
      reportMutationError(err, queryClient);
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
    await apiOrpcClient(listsContract, context.cookie).removeEntry({
      id: data.listId,
      itemId: data.entryId,
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

const bulkRemoveListEntriesFn = createServerFn({ method: "POST" })
  .validator((input: { listId: string; entryIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(listsContract, context.cookie).bulkDeleteEntries({
      id: data.listId,
      entryIds: data.entryIds,
    });
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

const shareListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: listId }): Promise<ListShareResponse> =>
    apiOrpcClient(listsContract, context.cookie).share({ id: listId }),
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
    await apiOrpcClient(listsContract, context.cookie).unshare({ id: listId });
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

// 404 (unknown/non-public token) is a typed NOT_FOUND error mapped to the
// sentinel the caller expects.
const fetchPublicListFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicListDetailResponse> => {
    const { error, data } = await safe(apiOrpcClient(publicListsContract).share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
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
