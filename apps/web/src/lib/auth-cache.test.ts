import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

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
});
