import { deckFoldersContract } from "@openrift/shared/contracts/deck-folders";
import type { DeckFolderListResponse, DeckFolderResponse } from "@openrift/shared/types/api/deck";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { deckFoldersKeys, decksKeys } from "@/features/decks/lib/decks-query-keys";
import { useRequiredUserId, useUserId } from "@/lib/auth-session";
import { reportMutationError } from "@/lib/query-client";
import { reorderInPlace } from "@/lib/reorder-in-place";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchDeckFolders = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DeckFolderListResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).list(),
  );

function deckFoldersQueryOptions(userId: string) {
  return queryOptions({
    queryKey: deckFoldersKeys.all(userId),
    queryFn: () => fetchDeckFolders(),
    select: (data: DeckFolderListResponse) => data.items,
    staleTime: 5 * 60 * 1000,
  });
}

/** `/decks` also serves signed-out visitors; with no session the query is disabled. */
export function useDeckFolders() {
  const userId = useUserId();
  return useQuery({
    ...deckFoldersQueryOptions(userId ?? ""),
    enabled: userId !== null && userId !== undefined,
  });
}

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
    invalidates: () => [deckFoldersKeys.all(userId)],
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
    invalidates: () => [deckFoldersKeys.all(userId)],
  });
}

const removeDeckFolderFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<void> => {
    await apiOrpcClient(deckFoldersContract, context.cookie).remove(data);
  });

/** Also invalidates the deck list: each deck's folder chip comes from that query. */
export function useRemoveDeckFolder() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<void, { id: string }>({
    mutationFn: (input) => removeDeckFolderFn({ data: input }),
    invalidates: () => [deckFoldersKeys.all(userId), decksKeys.all(userId)],
  });
}

const reorderDeckFoldersFn = createServerFn({ method: "POST" })
  .validator((input: { orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<void> => {
    await apiOrpcClient(deckFoldersContract, context.cookie).reorder(data);
  });

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
      const key = deckFoldersKeys.all(userId);
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
        queryClient.setQueryData(deckFoldersKeys.all(userId), context.previous);
      }
      // Declaring onError here replaces the QueryClient's default one; call it
      // explicitly or the rollback happens silently with no error toast.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: deckFoldersKeys.all(userId) });
    },
  });
}

const setDeckFoldersFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; folderIds: string[] }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckFolderListResponse> =>
    apiOrpcClient(deckFoldersContract, context.cookie).setForDeck(data),
  );

/** Also invalidates the deck list: folder membership changes both chips and counts. */
export function useSetDeckFolders() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<DeckFolderListResponse, { id: string; folderIds: string[] }>({
    mutationFn: (input) => setDeckFoldersFn({ data: input }),
    invalidates: () => [deckFoldersKeys.all(userId), decksKeys.all(userId)],
  });
}
