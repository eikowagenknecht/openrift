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

  // Regression: signing out used to spam `[Live Query Error] Source
  // collection 'copies' was manually cleaned up while live query
  // 'live-query-N' depends on it.` once per mounted useLiveQuery (collection
  // grid, sidebar, owned-count chips, etc.). The handler now flips the
  // session and awaits navigation before invoking clearUserScopedCache, so
  // every live query has unsubscribed by the time cleanup() runs. This test
  // pins the contract: when callers respect the invariant, cleanup is silent.
  it("does not fire `[Live Query Error]` warnings when no live query is subscribed", async () => {
    const queryClient = new QueryClient();
    // Prime the underlying ['copies'] query so the collection's queryFn
    // resolves from cache instead of hitting /api/v1/copies (no fetch in the
    // jsdom env).
    queryClient.setQueryData(queryKeys.copies.all, { items: [], nextCursor: null });
    const copies = getCopiesCollection(queryClient);

    // A live query that subscribed but already unmounted — mimics a sidebar
    // or grid that was active before the route transition and has since
    // detached.
    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: copies }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    // Wait until the live query has wired up its status:change listener on
    // the source — this is what fires the [Live Query Error] when the
    // source transitions to `cleaned-up` while a live query is depending on
    // it. Subscriber count > 0 is a proxy for "listener attached".
    await vi.waitFor(() => expect(copies.subscriberCount).toBeGreaterThan(0));
    subscription.unsubscribe();
    await liveQuery.cleanup();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await clearUserScopedCache(queryClient);
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

    // Simulate a mounted useSession() observer.
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
