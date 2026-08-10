import type { DeckFolderListResponse, DeckFolderResponse } from "@openrift/shared";
import { deckFoldersContract } from "@openrift/shared/contracts/deck-folders";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { reportMutationError } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { reorderInPlace } from "@/lib/reorder-in-place";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// ── READ ─────────────────────────────────────────────────────────────────────

const fetchDeckFolders = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DeckFolderListResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).list(),
  );

export function deckFoldersQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.deckFolders.all(userId),
    queryFn: () => fetchDeckFolders(),
    select: (data: DeckFolderListResponse) => data.items,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The signed-in user's deck folders. A plain `useQuery` rather than a suspense
 * one: the deck list renders perfectly well before folders arrive, and folders
 * are chrome on top of it rather than the page's subject.
 *
 * Uses `useUserId` rather than `useRequiredUserId` because `/decks` also serves
 * signed-out visitors (browser-local decks, ADR-035). With no session the query
 * is disabled and the surface hides its folder controls.
 * @returns The folders query; `data` stays undefined while signed out.
 */
export function useDeckFolders() {
  const userId = useUserId();
  return useQuery({
    ...deckFoldersQueryOptions(userId ?? ""),
    enabled: userId !== null && userId !== undefined,
  });
}

// ── MUTATIONS ────────────────────────────────────────────────────────────────

const createDeckFolderFn = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckFolderResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).create(data),
  );

export function useCreateDeckFolder() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckFolderResponse, { name: string }>({
    mutationFn: (input) => createDeckFolderFn({ data: input }),
    invalidates: () => [queryKeys.deckFolders.all(userId)],
  });
}

const renameDeckFolderFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; name: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckFolderResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).update(data),
  );

export function useRenameDeckFolder() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckFolderResponse, { id: string; name: string }>({
    mutationFn: (input) => renameDeckFolderFn({ data: input }),
    invalidates: () => [queryKeys.deckFolders.all(userId)],
  });
}

const removeDeckFolderFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<void> => {
    await apiOrpcClient(deckFoldersContract, context.cookie).remove(data);
  });

/**
 * Deletes a folder. The decks in it are untouched, so the deck list has to
 * refetch too — every deck that was filed here loses a chip.
 * @returns A mutation taking `{ id }`.
 */
export function useRemoveDeckFolder() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<void, { id: string }>({
    mutationFn: (input) => removeDeckFolderFn({ data: input }),
    invalidates: () => [queryKeys.deckFolders.all(userId), queryKeys.decks.all(userId)],
  });
}

const reorderDeckFoldersFn = createServerFn({ method: "POST" })
  .validator((input: { orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<void> => {
    await apiOrpcClient(deckFoldersContract, context.cookie).reorder(data);
  });

/**
 * Reorders the folders. Optimistic because the rows move under the pointer as
 * you drag; waiting a round trip there reads as a drag that snapped back.
 * @returns A mutation taking `{ orderedIds }`.
 */
export function useReorderDeckFolders() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { orderedIds: string[] },
    { previous: DeckFolderListResponse | undefined }
  >({
    mutationFn: (variables) => reorderDeckFoldersFn({ data: variables }),
    onMutate: ({ orderedIds }) => {
      const key = queryKeys.deckFolders.all(userId);
      const previous = queryClient.getQueryData<DeckFolderListResponse>(key);
      if (previous) {
        queryClient.setQueryData<DeckFolderListResponse>(key, {
          ...previous,
          items: reorderInPlace(previous.items, orderedIds),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.deckFolders.all(userId), context.previous);
      }
      // Declaring onError here replaces the QueryClient's default one, so the
      // rollback would otherwise revert the order with nothing telling the user
      // the reorder failed.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.deckFolders.all(userId) });
    },
  });
}

const setDeckFoldersFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; folderIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckFolderListResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).setForDeck(data),
  );

/**
 * Replaces one deck's folder membership. Invalidates the deck list as well as
 * the folders, since both the deck's chips and every folder's count can shift.
 * @returns A mutation taking `{ id, folderIds }`.
 */
export function useSetDeckFolders() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckFolderListResponse, { id: string; folderIds: string[] }>({
    mutationFn: (input) => setDeckFoldersFn({ data: input }),
    invalidates: () => [queryKeys.deckFolders.all(userId), queryKeys.decks.all(userId)],
  });
}
