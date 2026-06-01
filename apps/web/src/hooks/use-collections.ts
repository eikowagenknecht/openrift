import type {
  CollectionResponse,
  CollectionShareResponse,
  PublicCollectionDetailResponse,
} from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { useCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import { reorderInPlace } from "@/lib/reorder-in-place";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Re-export for back-compat with consumers that pulled it from this module
// before the split. Route loaders should import from @/lib/collections-query
// directly so the loader path doesn't drag in @tanstack/react-db.
export { collectionsQueryOptions };

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
  .inputValidator(
    (input: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
      groupSlug?: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<CollectionsResponse["items"][number]>({
      errorTitle: "Couldn't create collection",
      cookie: context.cookie,
      path: "/api/v1/collections",
      method: "POST",
      body: data,
    }),
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
  .inputValidator((input: { id: string; name?: string; description?: string | null }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) => {
    const { id, ...fields } = data;
    return fetchApiJson<CollectionsResponse["items"][number]>({
      errorTitle: "Couldn't update collection",
      cookie: context.cookie,
      path: `/api/v1/collections/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: fields,
    });
  });

export function useUpdateCollection() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (body: { id: string; name?: string; description?: string | null }) =>
      updateCollectionFn({ data: body }),
    invalidates: [queryKeys.collections.all(userId)],
  });
}

const setDeckbuildingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; available: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update deck-building availability",
      cookie: context.cookie,
      path: `/api/v1/collections/${encodeURIComponent(data.id)}/deckbuilding`,
      method: "PUT",
      body: { available: data.available },
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
  .inputValidator((input: { orderedIds: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reorder collections",
      cookie: context.cookie,
      path: "/api/v1/collections/reorder",
      method: "POST",
      body: data,
    });
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
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete collection",
      cookie: context.cookie,
      path: `/api/v1/collections/${data.id}`,
      method: "DELETE",
    });
  });

// ── Collection sharing ──────────────────────────────────────────────────────

const shareCollectionFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: collectionId }): Promise<CollectionShareResponse> =>
      fetchApiJson<CollectionShareResponse>({
        errorTitle: "Couldn't share collection",
        cookie: context.cookie,
        path: `/api/v1/collections/${encodeURIComponent(collectionId)}/share`,
        method: "POST",
      }),
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
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: collectionId }) => {
    await fetchApi({
      errorTitle: "Couldn't unshare collection",
      cookie: context.cookie,
      path: `/api/v1/collections/${encodeURIComponent(collectionId)}/share`,
      method: "DELETE",
    });
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
  .inputValidator((input: string) => input)
  .handler(async ({ data: token }): Promise<PublicCollectionDetailResponse> => {
    const basePath = `/api/v1/collections/share/${encodeURIComponent(token)}`;
    // 404 is legitimate (unknown/expired token) — map to NOT_FOUND without logging.
    const firstRes = await fetchApi({
      errorTitle: "Couldn't load shared collection",
      path: basePath,
      acceptStatuses: [404],
    });
    if (firstRes.status === 404) {
      throw new Error("NOT_FOUND");
    }
    const firstPage = (await firstRes.json()) as PublicCollectionDetailResponse;

    // Walk the cursor server-side so the SSR payload carries every copy for
    // collections larger than the API's per-page cap. Matches the authenticated
    // `fetchCopies` pattern in copies-query.ts.
    const allCopies = [...firstPage.copies];
    let cursor = firstPage.nextCursor;
    while (cursor) {
      const nextRes = await fetchApi({
        errorTitle: "Couldn't load shared collection",
        path: `${basePath}?cursor=${encodeURIComponent(cursor)}`,
      });
      const page = (await nextRes.json()) as PublicCollectionDetailResponse;
      allCopies.push(...page.copies);
      cursor = page.nextCursor;
    }

    return { ...firstPage, copies: allCopies, nextCursor: null };
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
