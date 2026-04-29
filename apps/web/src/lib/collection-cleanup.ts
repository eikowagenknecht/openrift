// Helpers for orchestrating collection lifecycle when the active user
// changes. All user-scoped TanStack DB collections are keyed by
// (queryClient, userId): on a user transition the previous user's collection
// becomes orphaned (no live-query consumer references it). What happens next
// depends on the collection type:
//
//   - QueryCollections (e.g. `copies`) auto-GC after their `gcTime` once
//     subscriberCount hits zero. We don't call cleanup() ourselves — it
//     would fire `[Live Query Error]` for every still-attached live query
//     during the React-commit gap. `markOrphaned` is purely observability.
//
//   - LocalOnlyCollections (e.g. deck-builder drafts) ship with `gcTime: 0`,
//     so auto-GC never fires. `cleanupWhenIdle` runs cleanup() the moment
//     subscriberCount transitions to 0 by listening for `subscribers:change`.
//     Reactive, not polled — no race, no warnings.

import type { Collection } from "@tanstack/react-db";

// The helpers only touch lifecycle surface (subscriberCount, status, on,
// cleanup), which is identical across all collection generic shapes. Using
// the fully-permissive Collection generics means callers don't have to thread
// their concrete generics through.
// oxlint-disable-next-line typescript/no-explicit-any -- variance escape hatch for the 5-generic Collection<...> shape
type AnyCollection = Collection<any, any, any, any, any>;

/**
 * Dev-only instrumentation for an orphaned collection. Traces subscriber
 * detach + eventual cleanup, and warns loudly if subscribers haven't
 * detached after a generous window — that would indicate a hook or
 * component holding a stale collection reference.
 */
export function markOrphaned(collection: AnyCollection, label: string): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const startedAt = performance.now();
  const initialCount = collection.subscriberCount;
  // oxlint-disable no-console -- dev-only diagnostic
  console.debug(`[orphan] ${label}: orphaned with ${initialCount} subscribers`);

  const offSubs = collection.on("subscribers:change", (event) => {
    console.debug(`[orphan] ${label}: ${event.previousSubscriberCount} → ${event.subscriberCount}`);
  });
  const offCleanup = collection.on("status:cleaned-up", () => {
    const elapsed = Math.round(performance.now() - startedAt);
    console.debug(`[orphan] ${label}: cleaned up after ${elapsed}ms`);
    offSubs();
    offCleanup();
  });

  setTimeout(() => {
    if (collection.subscriberCount > 0) {
      console.warn(
        `[orphan] ${label}: still has ${collection.subscriberCount} subscribers after 3s — possible leak`,
      );
    }
  }, 3000);
  // oxlint-enable no-console
}

/**
 * Schedule cleanup() for a collection that won't auto-GC (e.g. local-only).
 * Fires the moment subscriberCount transitions to 0 — never while a live
 * query is still attached, so the cleanup is silent.
 *
 * Safe to call multiple times for the same collection: re-entries against
 * an already-cleaned-up collection are no-ops.
 */
export function cleanupWhenIdle(collection: AnyCollection): void {
  if (collection.status === "cleaned-up") {
    return;
  }
  if (collection.subscriberCount === 0) {
    void collection.cleanup();
    return;
  }
  let done = false;
  const off = collection.on("subscribers:change", (event) => {
    if (done || event.subscriberCount > 0) {
      return;
    }
    done = true;
    off();
    void collection.cleanup();
  });
}
