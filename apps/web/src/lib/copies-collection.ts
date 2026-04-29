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

// Tear down the cached copies collection on auth changes (sign in / out).
// removeQueries on the underlying queryKey doesn't reach into the collection's
// own state — active live queries keep showing the previous user's rows until
// the collection itself is told to drop them. cleanup() stops sync and clears
// data; the next subscriber auto-restarts it via the queryFn against the new
// session.
//
// We wait for subscribers to detach before invoking cleanup(): on sign-out
// the caller has already awaited router.navigate(...) to a public route, but
// router.navigate's promise resolves before React commits the unmount of the
// authenticated route. Calling cleanup() while live queries are still
// attached transitions every subscriber to error state and floods the
// console with `[Live Query Error] Source collection 'copies' was manually
// cleaned up while live query 'live-query-N' depends on it.` The wait
// covers that React-commit gap.
export async function cleanupCopiesCollection(queryClient: QueryClient): Promise<void> {
  const existing = cache.get(queryClient);
  if (!existing) {
    return;
  }
  await waitForNoSubscribers(existing);
  await existing.cleanup();
}

const SUBSCRIBER_DETACH_TIMEOUT_MS = 1000;

/**
 * Poll subscriberCount until it reaches 0 or the timeout elapses. Used to
 * defer `collection.cleanup()` until React has finished unmounting the
 * authenticated route's useLiveQuery hooks.
 *
 * If the timeout expires we proceed with cleanup anyway — better to log the
 * spam than to hang the sign-out flow on a wedged subscriber.
 */
async function waitForNoSubscribers(
  collection: { subscriberCount: number },
  maxMs = SUBSCRIBER_DETACH_TIMEOUT_MS,
): Promise<void> {
  if (collection.subscriberCount === 0) {
    return;
  }
  const deadline = Date.now() + maxMs;
  while (collection.subscriberCount > 0 && Date.now() < deadline) {
    // oxlint-disable-next-line promise/avoid-new -- need to wrap rAF/setTimeout in a promise to await a paint frame
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }
}
