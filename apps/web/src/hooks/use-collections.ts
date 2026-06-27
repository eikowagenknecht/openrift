import type {
  CollectionResponse,
  CollectionShareResponse,
  PublicCollectionDetailResponse,
} from "@openrift/shared";
import { collectionsContract, publicCollectionsContract } from "@openrift/shared/contracts";
import { isDefinedError, safe } from "@orpc/client";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { useCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import { reorderInPlace } from "@/lib/reorder-in-place";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Re-export for back-compat with consumers that pulled it from this module
// before the split. Route loaders should import from @/lib/collections-query
// directly so the loader path doesn't drag in @tanstack/react-db.
export { collectionsQueryOptions } from "@/lib/collections-query";

export function useCollections() {
  const userId = useRequiredUserId();
  const copiesCollection = useCopiesCollection();
  const serverQuery = useSuspenseQuery(collectionsQueryOptions(userId));

  // Skip the live query during SSR: TanStack DB's live-query internals use
  // useSyncExternalStore without providing a getServerSnapshot, so running
  // it server-side forces a client-render fallback with a warning. On the
  // server we fall back to server-provided copyCount (stale but correct at
  // load). On the client, once the collection subscription is established,
  // we override copyCount with the derived value so mutations reflect
  // without waiting on a server round-trip.
  //
  // copiesCollection is null mid-sign-out (this hook itself unmounts an
  // instant later); same-shape fallback applies.
  const { data: copies } = useLiveQuery(
    (q) =>
      globalThis.window === undefined || !copiesCollection
        ? null
        : q.from({ copy: copiesCollection }),
    [copiesCollection],
  );

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

/**
 * Builds a Map from collection ID to CollectionResponse for O(1) lookups.
 * @returns A stable Map derived from the collections query data.
 */
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
  .handler(
    ({ context, data }): Promise<CollectionResponse> =>
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
    invalidates: [queryKeys.collections.all(userId)],
  });
}

const updateCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; name?: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<CollectionResponse> =>
      apiOrpcClient(collectionsContract, context.cookie).update(data),
  );

export function useUpdateCollection() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; name?: string; description?: string | null }) =>
      updateCollectionFn({ data: body }),
    invalidates: [queryKeys.collections.all(userId)],
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
 * Sets the *current viewer's* deck-building availability for a collection.
 * This is a per-member preference — every member with access can set it for
 * themselves, including for shared group collections — so it is not gated on
 * group-admin rights. Invalidating the collections list refreshes the
 * viewer-effective `availableForDeckbuilding` flag, which in turn drives the
 * owned/locked deck-building counts.
 *
 * @returns A mutation taking `{ id, available }`.
 */
export function useSetCollectionDeckbuilding() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; available: boolean }) => setDeckbuildingFn({ data: body }),
    invalidates: [queryKeys.collections.all(userId)],
  });
}

const reorderCollectionsFn = createServerFn({ method: "POST" })
  .validator((input: { orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).reorder(data);
  });

/**
 * Reorders the user's personal collections. The optimistic update reorders
 * the cached items in-place by `orderedIds`; rows not in the list (e.g.
 * group-owned collections) stay where they are. On error we roll back to
 * the snapshot we took in `onMutate`.
 *
 * @returns A mutation that takes `{ orderedIds }` and reorders personal
 *   collections in the sidebar.
 */
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
      const key = queryKeys.collections.all(userId);
      const previous = queryClient.getQueryData<CollectionsResponse>(key);
      if (previous) {
        queryClient.setQueryData<CollectionsResponse>(key, {
          ...previous,
          items: reorderInPlace(previous.items, orderedIds),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.collections.all(userId), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all(userId) });
    },
  });
}

const deleteCollectionFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(collectionsContract, context.cookie).remove({ id: data.id });
  });

// ── Collection sharing ──────────────────────────────────────────────────────

const shareCollectionFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: collectionId }): Promise<CollectionShareResponse> =>
      apiOrpcClient(collectionsContract, context.cookie).share({ id: collectionId }),
  );

export function useShareCollection() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) => shareCollectionFn({ data: collectionId }),
    onSuccess: (data, collectionId) => {
      queryClient.setQueryData<CollectionsResponse>(queryKeys.collections.all(userId), (old) =>
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
      queryClient.setQueryData<CollectionsResponse>(queryKeys.collections.all(userId), (old) =>
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
    // Migrated to oRPC: contract-typed client. 404 (unknown/expired token) is a
    // typed NOT_FOUND error mapped to the sentinel the route boundary expects.
    const client = apiOrpcClient(publicCollectionsContract);
    const { error, data: firstPage } = await safe(client.share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }

    // Walk the cursor server-side so the SSR payload carries every copy for
    // collections larger than the API's per-page cap. Matches the authenticated
    // `fetchCopies` pattern in copies-query.ts.
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
    queryKey: queryKeys.collections.publicByToken(token),
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
      // Server atomically moved the remaining copies to the inbox before
      // deleting the collection. Mirror that move in the synced copies
      // collection so live queries (sidebar counts, owned-count, grids)
      // reflect it immediately. Invalidating queryKeys.copies.all alone
      // doesn't work, because the TanStack DB collection is keyed
      // separately as ["copies-collection", userId].
      const cached = queryClient.getQueryData<CollectionsResponse>(
        queryKeys.collections.all(userId),
      );
      const inboxId = cached?.items.find((col) => col.isInbox)?.id;
      if (inboxId && copiesCollection) {
        const affected = copiesCollection.toArray.filter((copy) => copy.collectionId === deletedId);
        if (affected.length > 0) {
          copiesCollection.utils.writeUpdate(
            affected.map((copy) => ({ id: copy.id, collectionId: inboxId })),
          );
        }
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all(userId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.copies.all(userId),
        refetchType: "none",
      });
    },
  });
}
