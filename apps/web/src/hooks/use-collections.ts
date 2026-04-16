import type { CollectionResponse } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getCopiesCollection } from "@/lib/copies-collection";
import { queryKeys } from "@/lib/query-keys";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCollections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<CollectionsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/collections`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Collections fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CollectionsResponse>;
  });

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
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/collections`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Create collection failed: ${res.status}`);
    }
    return res.json() as Promise<CollectionsResponse["items"][number]>;
  });

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
    const res = await fetch(`${API_URL}/api/v1/collections/${data.id}`, {
      method: "DELETE",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Delete collection failed: ${res.status}`);
    }
  });

export function useDeleteCollection() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) => deleteCollectionFn({ data: { id } }),
    invalidates: [queryKeys.collections.all, queryKeys.copies.all],
  });
}
