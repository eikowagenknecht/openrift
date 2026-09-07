import { collectionsContract } from "@openrift/shared/contracts/collections";
import { publicCollectionsContract } from "@openrift/shared/contracts/public-collections";
import type {
  ClearCollectionResponse,
  CollectionResponse,
  CollectionShareResponse,
  PublicCollectionDetailResponse,
  ResetCollectionsResponse,
} from "@openrift/shared/types/api/collection";
import { isDefinedError, safe } from "@orpc/client";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { collectionsKeys, copiesKeys } from "@/features/collections/lib/collections-query-keys";
import { useCopiesCollection } from "@/features/collections/lib/copies-collection";
import { useRequiredUserId } from "@/lib/auth-session";
import { reportMutationError } from "@/lib/query-client";
import { reorderInPlace } from "@/lib/reorder-in-place";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Route loaders must import from @/lib/collections-query directly, or the
// loader path drags in @tanstack/react-db.
export { collectionsQueryOptions } from "@/features/collections/lib/collections-query";

export function useCollections() {
  const userId = useRequiredUserId();
  const copiesCollection = useCopiesCollection();
  const serverQuery = useSuspenseQuery(collectionsQueryOptions(userId));

  // SSR: TanStack DB's live-query internals call useSyncExternalStore without
  // a getServerSnapshot, forcing a client-render fallback warning server-side.
  const { data: copies } = useLiveQuery({
    query: (q) =>
      globalThis.window === undefined || !copiesCollection
        ? null
        : q.from({ copy: copiesCollection }),
  });

  if (!copies) {
    return serverQuery;
  }
  const countById = new Map<string, number>();
  for (const copy of copies) {
    countById.set(copy.collectionId, (countById.get(copy.collectionId) ?? 0) + 1);
  }
  const data = serverQuery.data.map((col) => ({
    ...col,
    copyCount: countById.get(col.id) ?? 0,
  }));
  return { ...serverQuery, data };
}

export function useCollectionsMap(): Map<string, CollectionResponse> {
  "use memo";
  const { data: collections } = useCollections();
  return new Map(collections.map((col) => [col.id, col]));
}

const createCollectionFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
      groupSlug?: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CollectionResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).create(data),
  );

export function useCreateCollection() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
      groupSlug?: string;
    }) => createCollectionFn({ data: body }),
    invalidates: [collectionsKeys.all(userId)],
  });
}

const updateCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; name?: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CollectionResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).update(data),
  );

export function useUpdateCollection() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; name?: string; description?: string | null }) =>
      updateCollectionFn({ data: body }),
    invalidates: [collectionsKeys.all(userId)],
  });
}

const setDeckbuildingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; available: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).setDeckbuilding({
      id: data.id,
      available: data.available,
    });
  });

/**
 * Sets the current viewer's own deck-building availability for a collection: a
 * per-member preference, so it's not gated on group-admin rights even for shared collections.
 */
export function useSetCollectionDeckbuilding() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; available: boolean }) => setDeckbuildingFn({ data: body }),
    invalidates: [collectionsKeys.all(userId)],
  });
}

const setCollectionSidebarHiddenFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; hidden: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).setSidebarHidden({
      id: data.id,
      hidden: data.hidden,
    });
  });

/**
 * Moves a collection behind the sidebar's "Show more" toggle. Per-viewer like
 * deck-building availability, so a shared group member only curates their own sidebar.
 */
export function useSetCollectionSidebarHidden() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { id: string; hidden: boolean },
    { previous: CollectionsResponse | undefined }
  >({
    mutationFn: (variables) => setCollectionSidebarHiddenFn({ data: variables }),
    onMutate: ({ id, hidden }) => {
      const key = collectionsKeys.all(userId);
      const previous = queryClient.getQueryData<CollectionsResponse>(key);
      if (previous) {
        queryClient.setQueryData<CollectionsResponse>(key, {
          ...previous,
          items: previous.items.map((col) =>
            col.id === id ? { ...col, sidebarHidden: hidden } : col,
          ),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(collectionsKeys.all(userId), context.previous);
      }
      // Declaring onError here replaces the QueryClient's default one.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all(userId) });
    },
  });
}

const reorderCollectionsFn = createServerFn({ method: "POST" })
  .validator((input: { orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).reorder(data);
  });

/** Rows not in `orderedIds` (e.g. group-owned collections) stay where they are. */
export function useReorderCollections() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { orderedIds: string[] },
    { previous: CollectionsResponse | undefined }
  >({
    mutationFn: (variables) => reorderCollectionsFn({ data: variables }),
    onMutate: ({ orderedIds }) => {
      const key = collectionsKeys.all(userId);
      const previous = queryClient.getQueryData<CollectionsResponse>(key);
      if (previous) {
        queryClient.setQueryData<CollectionsResponse>(key, {
          ...previous,
          items: reorderInPlace(previous.items, orderedIds),
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(collectionsKeys.all(userId), context.previous);
      }
      // Declaring onError here replaces the QueryClient's default one.
      reportMutationError(error, queryClient);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all(userId) });
    },
  });
}

const deleteCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).remove({ id: data.id });
  });

const clearCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ClearCollectionResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).clear({ id: data.id }),
  );

const shareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: collectionId }): Promise<CollectionShareResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).share({ id: collectionId }),
  );

export function useShareCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => shareCollectionFn({ data: collectionId }),
    onSuccess: (data, collectionId) => {
      queryClient.setQueryData<CollectionsResponse>(collectionsKeys.all(userId), (old) =>
        old
          ? {
              ...old,
              items: old.items.map((col) =>
                col.id === collectionId
                  ? { ...col, isPublic: data.isPublic, shareToken: data.shareToken }
                  : col,
              ),
            }
          : old,
      );
    },
  });
}

const unshareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: collectionId }) => {
    await apiOrpcClient(collectionsContract, context.cookie).unshare({ id: collectionId });
  });

export function useUnshareCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => unshareCollectionFn({ data: collectionId }),
    onSuccess: (_, collectionId) => {
      queryClient.setQueryData<CollectionsResponse>(collectionsKeys.all(userId), (old) =>
        old
          ? {
              ...old,
              items: old.items.map((col) =>
                col.id === collectionId ? { ...col, isPublic: false, shareToken: null } : col,
              ),
            }
          : old,
      );
    },
  });
}

const fetchPublicCollectionFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicCollectionDetailResponse> => {
    // 404 (unknown/expired token) is a typed NOT_FOUND error mapped to the
    // sentinel the route boundary expects.
    const client = apiOrpcClient(publicCollectionsContract);
    const { error, data: firstPage } = await safe(client.share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }

    // Walk the cursor server-side so the SSR payload carries every copy, matching
    // the authenticated `fetchCopies` pattern in copies-query.ts.
    const allCopies = [...firstPage.items];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const page = await client.share({ token, cursor });
      allCopies.push(...page.items);
      cursor = page.nextCursor;
    }

    return { ...firstPage, items: allCopies, nextCursor: null };
  });

export function publicCollectionQueryOptions(token: string) {
  return queryOptions({
    queryKey: collectionsKeys.publicByToken(token),
    queryFn: () => fetchPublicCollectionFn({ data: token }),
  });
}

export function usePublicCollection(token: string) {
  return useSuspenseQuery(publicCollectionQueryOptions(token));
}

export function useDeleteCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteCollectionFn({ data: { id } });
      return id;
    },
    onSuccess: (deletedId) => {
      // Server atomically moved the remaining copies to the inbox; mirror that in the
      // synced copies collection since it's keyed separately as ["copies-collection", userId]
      // and invalidating copiesKeys.all alone won't reach it.
      const cached = queryClient.getQueryData<CollectionsResponse>(collectionsKeys.all(userId));
      const inboxId = cached?.items.find((col) => col.isInbox)?.id;
      if (inboxId && copiesCollection) {
        const affected = copiesCollection.toArray.filter((copy) => copy.collectionId === deletedId);
        if (affected.length > 0) {
          // The schema forbids a group inbox, so groupId must clear too or these
          // copies stay excluded from the viewer's personal owned totals.
          copiesCollection.utils.writeUpdate(
            affected.map((copy) => ({ id: copy.id, collectionId: inboxId, groupId: null })),
          );
        }
      }
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all(userId) });
      void queryClient.invalidateQueries({
        queryKey: copiesKeys.all(userId),
        refetchType: "none",
      });
    },
  });
}

/** Copies pinned by a live trade or loan stay put; the server reports them as `keptCopyIds`. */
export function useClearCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    mutationFn: async (id: string): Promise<ClearCollectionResponse & { id: string }> => {
      const result = await clearCollectionFn({ data: { id } });
      return { id, ...result };
    },
    onSuccess: ({ id, keptCopyIds }) => {
      // Mirror the server-side clear in the synced copies collection, same as useDeleteCollection.
      if (copiesCollection) {
        const kept = new Set(keptCopyIds);
        const removedIds = copiesCollection.toArray
          .filter((copy) => copy.collectionId === id && !kept.has(copy.id))
          .map((copy) => copy.id);
        if (removedIds.length > 0) {
          copiesCollection.utils.writeDelete(removedIds);
        }
      }
      void queryClient.invalidateQueries({ queryKey: collectionsKeys.all(userId) });
      void queryClient.invalidateQueries({
        queryKey: copiesKeys.all(userId),
        refetchType: "none",
      });
    },
  });
}

// Exported for tests only — call through useResetCollections in app code.
export const resetCollectionsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<ResetCollectionsResponse> => {
    const { error, data } = await safe(
      apiOrpcClient(collectionsContract, context.cookie).resetAll(),
    );
    if (error) {
      // Rethrow the 409 CONFLICT plain so the dialog can show its user-readable message.
      if (isDefinedError(error) && error.code === "CONFLICT") {
        throw new Error(error.message);
      }
      throw error;
    }
    return data;
  });

/**
 * Danger-zone reset: wipes every copy from the user's personal collections, deletes
 * all personal collections except the inbox, and prunes lists it emptied. Group collections untouched.
 */
export function useResetCollections() {
  const queryClient = useQueryClient();
  const copiesCollection = useCopiesCollection();

  return useMutation({
    mutationFn: () => resetCollectionsFn(),
    onSuccess: () => {
      // Drop personal copies from the synced store immediately; group-owned copies survive.
      if (copiesCollection) {
        const personal = copiesCollection.toArray.filter((copy) => copy.groupId === null);
        if (personal.length > 0) {
          copiesCollection.utils.writeDelete(personal.map((copy) => copy.id));
        }
      }
      // Invalidates the whole cache: the wipe touches nearly every user-scoped surface.
      void queryClient.invalidateQueries();
    },
  });
}
