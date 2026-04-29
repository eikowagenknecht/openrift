import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

import { getDeckDraftCollection, hydrateDeckDraft } from "./deck-builder-collection";

let queryClient: QueryClient;

const userA = "user-a";
const userB = "user-b";

beforeEach(() => {
  resetIdCounter();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  queryClient.clear();
});

describe("getDeckDraftCollection", () => {
  it("returns the same collection for the same (userId, deckId) on the same client", () => {
    const a = getDeckDraftCollection(queryClient, userA, "deck-1");
    const b = getDeckDraftCollection(queryClient, userA, "deck-1");
    expect(a).toBe(b);
  });

  it("returns distinct collections for different deck ids under the same user", () => {
    const a = getDeckDraftCollection(queryClient, userA, "deck-1");
    const b = getDeckDraftCollection(queryClient, userA, "deck-2");
    expect(a).not.toBe(b);
  });

  it("returns distinct collections for the same deck id under different users", () => {
    const a = getDeckDraftCollection(queryClient, userA, "deck-1");
    const b = getDeckDraftCollection(queryClient, userB, "deck-1");
    expect(a).not.toBe(b);
  });

  it("isolates collections across QueryClients", () => {
    const a = getDeckDraftCollection(queryClient, userA, "deck-1");
    const other = new QueryClient();
    const b = getDeckDraftCollection(other, userA, "deck-1");
    expect(a).not.toBe(b);
    other.clear();
  });

  it("orphans previous-user drafts when the active user changes", async () => {
    const previous = getDeckDraftCollection(queryClient, userA, "deck-1");
    const cleanupSpy = vi.spyOn(previous, "cleanup");
    expect(previous.status).not.toBe("cleaned-up");

    // Switching to a different user should evict and tear down the prior
    // user's drafts. With no live-query subscribers attached, the cleanup
    // is silent and runs immediately.
    getDeckDraftCollection(queryClient, userB, "deck-1");

    await vi.waitFor(() => expect(cleanupSpy).toHaveBeenCalled());
  });
});

describe("hydrateDeckDraft", () => {
  it("seeds a fresh collection with the given cards", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 2 }),
      stubDeckBuilderCard({ cardId: "c2", zone: "sideboard", quantity: 1 }),
    ];
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-fresh", cards);
    const stored = [...getDeckDraftCollection(queryClient, userA, "deck-hydrate-fresh").values()];
    expect(stored).toHaveLength(2);
    expect(stored.map((c) => c.cardId).toSorted()).toEqual(["c1", "c2"]);
  });

  it("replaces existing contents when re-hydrated", () => {
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-replace", [
      stubDeckBuilderCard({ cardId: "old", zone: "main", quantity: 3 }),
    ]);
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-replace", [
      stubDeckBuilderCard({ cardId: "new", zone: "sideboard", quantity: 1 }),
    ]);
    const stored = [...getDeckDraftCollection(queryClient, userA, "deck-hydrate-replace").values()];
    expect(stored).toHaveLength(1);
    expect(stored[0].cardId).toBe("new");
  });

  it("updates the quantity of matching entries in place", () => {
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-update", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 1 }),
    ]);
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-update", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 3 }),
    ]);
    const stored = [...getDeckDraftCollection(queryClient, userA, "deck-hydrate-update").values()];
    expect(stored[0].quantity).toBe(3);
  });

  it("keeps the same collection instance when re-hydrated", () => {
    const first = getDeckDraftCollection(queryClient, userA, "deck-hydrate-same");
    hydrateDeckDraft(queryClient, userA, "deck-hydrate-same", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main" }),
    ]);
    const second = getDeckDraftCollection(queryClient, userA, "deck-hydrate-same");
    expect(second).toBe(first);
  });
});
