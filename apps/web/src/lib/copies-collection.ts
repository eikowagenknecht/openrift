// Copies collection: all of one user's copies, keyed by copy id. Per-collection
// views are live-query filters on `collectionId`, not separate collections.
//
// Collection identity is tied to (queryClient, userId): different users get
// different collection instances, segregating data by construction. On a user
// change the previous entry is evicted from the cache and `markOrphaned`
// instruments it so we can verify subscribers detach. We never call
// `cleanup()` ourselves — TanStack DB's auto-GC fires it once subscriberCount
// hits 0, by which point no live query is attached, so the cleanup is silent.

import type { CopyResponse } from "@openrift/shared";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useSession } from "@/lib/auth-session";
import { markOrphaned } from "@/lib/collection-cleanup";
import { copiesQueryOptions } from "@/lib/copies-query";

interface CacheEntry {
  userId: string;
  collection: Collection<CopyResponse, string | number>;
}

const cache = new WeakMap<QueryClient, CacheEntry>();

export function getCopiesCollection(
  queryClient: QueryClient,
  userId: string,
): Collection<CopyResponse, string | number> {
  const existing = cache.get(queryClient);
  if (existing && existing.userId === userId) {
    return existing.collection;
  }
  if (existing) {
    markOrphaned(existing.collection, `copies:${existing.userId}`);
  }

  const options = copiesQueryOptions(userId);
  const collection = createCollection(
    queryCollectionOptions<CopyResponse>({
      id: `copies:${userId}`,
      queryClient,
      // Per-user queryKey so user A's copies cache and user B's never share
      // a slot. Distinct from copiesQueryOptions' queryKey: this one stores
      // an array (what QueryCollection expects), the other stores the full
      // CopyListResponse object. The fetch is deduped via fetchQuery below.
      queryKey: ["copies-collection", userId],
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

  cache.set(queryClient, { userId, collection });
  return collection;
}

/**
 * Hook variant: derives the active userId from the session and returns the
 * current user's copies collection, or null when no one is signed in.
 *
 * Live-query consumers should pass the result into the live-query body and
 * include it in their dependency array — when the collection identity
 * changes (sign-in / sign-out / verify-email), the live query re-subscribes.
 *
 * @returns The current user's copies collection, or null when signed out.
 */
export function useCopiesCollection(): Collection<CopyResponse, string | number> | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id ?? null;
  return useMemo(
    () => (userId ? getCopiesCollection(queryClient, userId) : null),
    [queryClient, userId],
  );
}
