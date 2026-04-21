import type { CollectionResponse } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCollections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CollectionsResponse> =>
      fetchApiJson<CollectionsResponse>({
        errorTitle: "Couldn't load collections",
        cookie: context.cookie,
        path: "/api/v1/collections",
      }),
  );

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections.all,
  queryFn: () => fetchCollections(),
  select: (data: CollectionsResponse) => data.items,
  // Default is 0 (immediately stale), which caused 3-4 fetches per
  // navigation: each subscriber that mounted post-fetch saw stale data and
  // kicked off another fetch. 5-minute freshness matches catalog conventions
  // and still lets explicit invalidation (useCreateCollection /
  // useDeleteCollection) force a refresh.
  staleTime: 5 * 60 * 1000,
});

export function useCollections() {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);
  const serverQuery = useSuspenseQuery(collectionsQueryOptions);

  // Skip the live query during SSR: TanStack DB's live-query internals use
  // useSyncExternalStore without providing a getServerSnapshot, so running
  // it server-side forces a client-render fallback with a warning. On the
  // server we fall back to server-provided copyCount (stale but correct at
  // load). On the client, once the collection subscription is established,
  // we override copyCount with the derived value so mutations reflect
  // without waiting on a server round-trip.
  const { data: copies } = useLiveQuery((q) =>
    globalThis.window === undefined ? null : q.from({ copy: copiesCollection }),
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
    (input: { name: string; description?: string | null; availableForDeckbuilding?: boolean }) =>
      input,
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
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
    }) => createCollectionFn({ data: body }),
    invalidates: [queryKeys.collections.all],
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

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  const copiesCollection = getCopiesCollection(queryClient);

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
      // separately as ["copies-collection"].
      const cached = queryClient.getQueryData<CollectionsResponse>(queryKeys.collections.all);
      const inboxId = cached?.items.find((col) => col.isInbox)?.id;
      if (inboxId) {
        const affected = copiesCollection.toArray.filter((copy) => copy.collectionId === deletedId);
        if (affected.length > 0) {
          copiesCollection.utils.writeUpdate(
            affected.map((copy) => ({ id: copy.id, collectionId: inboxId })),
          );
        }
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.copies.all,
        refetchType: "none",
      });
    },
  });
}
