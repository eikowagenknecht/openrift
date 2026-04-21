import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { sessionQueryOptions } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";

import { clearUserScopedCache } from "./auth-cache";

describe("clearUserScopedCache", () => {
  it("removes cached user-scoped data so a new user doesn't see the previous user's cache", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.collections.all, {
      items: [{ id: "col-a", name: "User A collection", copyCount: 3, isInbox: false }],
    });
    queryClient.setQueryData(queryKeys.copies.all, { items: [{ id: "copy-a" }] });
    queryClient.setQueryData(queryKeys.decks.all, [{ id: "deck-a" }]);

    clearUserScopedCache(queryClient);

    expect(queryClient.getQueryData(queryKeys.collections.all)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.copies.all)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.decks.all)).toBeUndefined();
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

    clearUserScopedCache(queryClient);

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(sessionKey)).toEqual({ user: { id: "user-b" } });
    });
    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
