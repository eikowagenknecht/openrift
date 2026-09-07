// Collection identity is tied to (queryClient, userId): a user change evicts the previous
// entry and marks it orphaned. cleanup() is never called directly; TanStack DB's auto-GC
// fires it once subscriberCount hits 0.

import type { CopyResponse } from "@openrift/shared/types/api/collection";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { Collection } from "@tanstack/react-db";
import { createCollection } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth-session";
import { markOrphaned } from "@/lib/collection-cleanup";
import { copiesQueryOptions } from "@/lib/copies-query";
import { queryKeys } from "@/lib/query-keys";

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
      // Distinct from copiesQueryOptions' queryKey: this one stores the array QueryCollection
      // expects, not the full CopyListResponse object.
      queryKey: [...queryKeys.copies.syncedStore(userId)],
      queryFn: async () => {
        // staleTime: "static" always returns cached data regardless of staleness, which
        // breaks invalidateQueries-driven refetches after mutations. Use the default.
        const response = await queryClient.query({
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

// Live-query consumers must include the result in their dependency array so a collection
// identity change (sign-in / sign-out / verify-email) re-subscribes the query.
export function useCopiesCollection(): Collection<CopyResponse, string | number> | null {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user?.id ?? null;
  return userId ? getCopiesCollection(queryClient, userId) : null;
}
