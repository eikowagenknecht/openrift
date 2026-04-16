// Copies collection: all of a user's copies, keyed by copy id. Per-collection
// views are live-query filters on `collectionId`, not separate collections.
//
// Bound to the router's QueryClient via a per-client WeakMap so SSR per-request
// isolation holds (copies are user-scoped — cross-request leakage would be a
// security bug, unlike the public catalog).

import type { CopyResponse } from "@openrift/shared";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";

import { copiesQueryOptions } from "@/lib/copies-query";

const cache = new WeakMap<QueryClient, Collection<CopyResponse, string | number>>();

export function getCopiesCollection(
  queryClient: QueryClient,
): Collection<CopyResponse, string | number> {
  const existing = cache.get(queryClient);
  if (existing) {
    return existing;
  }

  const options = copiesQueryOptions();
  const collection = createCollection(
    queryCollectionOptions<CopyResponse>({
      id: "copies",
      queryClient,
      // Collection uses its own queryKey because QueryCollection stores an
      // array at this key, while copiesQueryOptions stores a CopyListResponse
      // object (with .items) at queryKeys.copies.all. Sharing the key
      // confuses the shape-checker. The fetch is still deduped across both
      // via ensureQueryData on the public key below.
      queryKey: ["copies-collection"],
      queryFn: async () => {
        // fetchQuery respects staleTime: returns cached data if fresh, but
        // refetches from the server if stale. ensureQueryData (what we used
        // before) always returns cached, regardless of staleness — which
        // meant our invalidateQueries after mutations never translated into
        // a refetch, and refetchOnReconnect just handed back the stale
        // pre-mutation snapshot.
        const response = await queryClient.fetchQuery({
          queryKey: options.queryKey,
          queryFn: options.queryFn,
        });
        return response.items;
      },
      getKey: (copy) => copy.id,
    }),
  );

  cache.set(queryClient, collection);
  return collection;
}
