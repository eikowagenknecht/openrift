import { createLiveQueryCollection } from "@tanstack/react-db";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { sessionQueryOptions } from "@/lib/auth-session";
import { getCopiesCollection } from "@/lib/copies-collection";
import { getDeckDraftCollection } from "@/lib/deck-builder-collection";
import { queryKeys } from "@/lib/query-keys";

import { clearUserScopedCache } from "./auth-cache";

describe("clearUserScopedCache", () => {
  it("removes cached user-scoped data so a new user doesn't see the previous user's cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.collections.all, {
      items: [{ id: "col-a", name: "User A collection", copyCount: 3, isInbox: false }],
    });
    queryClient.setQueryData(queryKeys.copies.all, { items: [{ id: "copy-a" }] });
    queryClient.setQueryData(queryKeys.decks.all, [{ id: "deck-a" }]);

    await clearUserScopedCache(queryClient);

    expect(queryClient.getQueryData(queryKeys.collections.all)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.copies.all)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.decks.all)).toBeUndefined();
  });

  it("tears down the copies collection so the previous user's rows don't survive in useLiveQuery subscribers", async () => {
    const queryClient = new QueryClient();
    const collection = getCopiesCollection(queryClient);
    const cleanupSpy = vi.spyOn(collection, "cleanup");

    await clearUserScopedCache(queryClient);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("tears down deck-builder draft collections and drops pending save state", async () => {
    const queryClient = new QueryClient();
    const draft = getDeckDraftCollection(queryClient, "deck-1");
    const cleanupSpy = vi.spyOn(draft, "cleanup");

    await clearUserScopedCache(queryClient);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  // Regression: signing out flooded the console with `[Live Query Error]
  // Source collection 'copies' was manually cleaned up while live query
  // 'live-query-N' depends on it.` once per mounted useLiveQuery (collection
  // grid, sidebar, owned-count chips, etc.). Most of those hooks DON'T gate
  // on session, so they only detach when the route unmounts — and `await
  // router.navigate(...)` resolves before React commits the unmount, leaving
  // cleanup() to find them attached. The fix: cleanup waits for
  // subscriberCount to drop before invoking collection.cleanup().
  it("waits for live-query subscribers to detach before calling collection.cleanup()", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.copies.all, { items: [], nextCursor: null });
    const copies = getCopiesCollection(queryClient);

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: copies }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    await vi.waitFor(() => expect(copies.subscriberCount).toBeGreaterThan(0));

    const cleanupSpy = vi.spyOn(copies, "cleanup");
    const clearPromise = clearUserScopedCache(queryClient);

    // Cleanup must not run while subscribers are still attached.
    // oxlint-disable-next-line promise/avoid-new no-promise-executor-return -- need to await a fixed delay to verify cleanup hasn't fired yet
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cleanupSpy).not.toHaveBeenCalled();

    // Mimic React committing the route unmount: the live query detaches.
    subscription.unsubscribe();
    await liveQuery.cleanup();

    await clearPromise;
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("does not fire `[Live Query Error]` warnings when the route unmounts before cleanup completes", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.copies.all, { items: [], nextCursor: null });
    const copies = getCopiesCollection(queryClient);

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: copies }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    await vi.waitFor(() => expect(copies.subscriberCount).toBeGreaterThan(0));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const clearPromise = clearUserScopedCache(queryClient);
      // Detach the live query mid-flight, like the route transition would.
      subscription.unsubscribe();
      await liveQuery.cleanup();
      await clearPromise;

      const liveQueryErrors = errorSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[Live Query Error]"),
      );
      expect(liveQueryErrors).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("refetches the session query so an active useSession observer picks up the new auth state", async () => {
    const queryClient = new QueryClient();
    const sessionKey = sessionQueryOptions().queryKey;
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ user: { id: "user-a" } })
      .mockResolvedValueOnce({ user: { id: "user-b" } });

    const observer = new QueryObserver(queryClient, {
      queryKey: sessionKey,
      queryFn,
    });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    await clearUserScopedCache(queryClient);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(sessionKey)).toEqual({ user: { id: "user-b" } });
    });
    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
