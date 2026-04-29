import { createLiveQueryCollection } from "@tanstack/react-db";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCopiesCollection } from "./copies-collection";
import { queryKeys } from "./query-keys";

let queryClient: QueryClient;

const userA = "user-a";
const userB = "user-b";

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("getCopiesCollection", () => {
  it("returns the same collection for the same (queryClient, userId)", () => {
    const a = getCopiesCollection(queryClient, userA);
    const b = getCopiesCollection(queryClient, userA);
    expect(a).toBe(b);
  });

  it("returns a different collection when the active userId changes", () => {
    const a = getCopiesCollection(queryClient, userA);
    const b = getCopiesCollection(queryClient, userB);
    expect(a).not.toBe(b);
  });

  it("isolates collections across QueryClients", () => {
    const a = getCopiesCollection(queryClient, userA);
    const other = new QueryClient();
    const b = getCopiesCollection(other, userA);
    expect(a).not.toBe(b);
    other.clear();
  });

  it("uses a per-user queryKey so two users' caches never share a slot", () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [{ id: "alice-1" }] });
    queryClient.setQueryData(queryKeys.copies.all(userB), { items: [{ id: "bob-1" }] });

    expect(queryClient.getQueryData(queryKeys.copies.all(userA))).toEqual({
      items: [{ id: "alice-1" }],
    });
    expect(queryClient.getQueryData(queryKeys.copies.all(userB))).toEqual({
      items: [{ id: "bob-1" }],
    });
  });

  // Regression: signing out flooded the console with `[Live Query Error]`
  // because the previous architecture called `cleanup()` on the singleton
  // copies collection while live-query subscribers were still attached.
  // With per-user collection identity, sign-out / sign-in just changes the
  // userId; the previous user's collection is not torn down by us — it's
  // orphaned and auto-GC'd when subscribers naturally detach. No warning.
  it("does not surface [Live Query Error] when the active user changes mid-subscription", async () => {
    queryClient.setQueryData(queryKeys.copies.all(userA), { items: [], nextCursor: null });
    const aliceCopies = getCopiesCollection(queryClient, userA);

    const liveQuery = createLiveQueryCollection({
      query: (q) => q.from({ copy: aliceCopies }),
      startSync: true,
    });
    const subscription = liveQuery.subscribeChanges(() => {});
    await vi.waitFor(() => expect(aliceCopies.subscriberCount).toBeGreaterThan(0));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Active user switches to userB. The previous user's collection becomes
      // orphaned — not touched, just no longer cached. Subscribers stay
      // attached until the consumer unmounts.
      getCopiesCollection(queryClient, userB);

      // Mimic the consumer unmount: detach the live query.
      subscription.unsubscribe();
      await liveQuery.cleanup();

      const liveQueryErrors = errorSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[Live Query Error]"),
      );
      expect(liveQueryErrors).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
