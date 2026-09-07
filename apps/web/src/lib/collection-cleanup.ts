// QueryCollections auto-GC once subscriberCount hits zero. Never call cleanup() on one manually:
// it races a live query's [Live Query Error] during the React-commit gap.
// LocalOnlyCollections have gcTime: 0 and never auto-GC; cleanupWhenIdle calls cleanup() reactively
// when subscriberCount transitions to 0.

import type { Collection } from "@tanstack/react-db";

// oxlint-disable-next-line typescript/no-explicit-any -- variance escape hatch for the 5-generic Collection<...> shape
type AnyCollection = Collection<any, any, any, any, any>;

/** Dev-only: traces an orphaned collection's subscriber detach and warns if none occurs within 3s. */
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

/** Runs cleanup() once subscriberCount hits 0. Safe to call repeatedly; no-ops after cleanup. */
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
