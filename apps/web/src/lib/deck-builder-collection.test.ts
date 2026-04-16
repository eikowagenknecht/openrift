import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

import {
  destroyDeckDraft,
  getDeckDraftCollection,
  hydrateDeckDraft,
} from "./deck-builder-collection";

let queryClient: QueryClient;

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
  it("returns the same collection for the same deckId on the same client", () => {
    const deckId = "deck-1";
    const a = getDeckDraftCollection(queryClient, deckId);
    const b = getDeckDraftCollection(queryClient, deckId);
    expect(a).toBe(b);
    destroyDeckDraft(queryClient, deckId);
  });

  it("returns distinct collections for different deck ids", () => {
    const a = getDeckDraftCollection(queryClient, "deck-1");
    const b = getDeckDraftCollection(queryClient, "deck-2");
    expect(a).not.toBe(b);
    destroyDeckDraft(queryClient, "deck-1");
    destroyDeckDraft(queryClient, "deck-2");
  });
});

describe("hydrateDeckDraft", () => {
  it("seeds a fresh collection with the given cards", () => {
    const deckId = "deck-hydrate-fresh";
    const cards = [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 2 }),
      stubDeckBuilderCard({ cardId: "c2", zone: "sideboard", quantity: 1 }),
    ];
    hydrateDeckDraft(queryClient, deckId, cards);
    const collection = getDeckDraftCollection(queryClient, deckId);
    const stored = [...collection.values()];
    expect(stored).toHaveLength(2);
    expect(stored.map((c) => c.cardId).toSorted()).toEqual(["c1", "c2"]);
    destroyDeckDraft(queryClient, deckId);
  });

  it("replaces existing contents when re-hydrated", () => {
    const deckId = "deck-hydrate-replace";
    hydrateDeckDraft(queryClient, deckId, [
      stubDeckBuilderCard({ cardId: "old", zone: "main", quantity: 3 }),
    ]);
    hydrateDeckDraft(queryClient, deckId, [
      stubDeckBuilderCard({ cardId: "new", zone: "sideboard", quantity: 1 }),
    ]);
    const collection = getDeckDraftCollection(queryClient, deckId);
    const stored = [...collection.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0].cardId).toBe("new");
    destroyDeckDraft(queryClient, deckId);
  });

  it("updates the quantity of matching entries in place", () => {
    const deckId = "deck-hydrate-update";
    hydrateDeckDraft(queryClient, deckId, [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 1 }),
    ]);
    hydrateDeckDraft(queryClient, deckId, [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 3 }),
    ]);
    const collection = getDeckDraftCollection(queryClient, deckId);
    expect([...collection.values()][0].quantity).toBe(3);
    destroyDeckDraft(queryClient, deckId);
  });
});

describe("destroyDeckDraft", () => {
  it("drops the cached collection so the next call returns a new one", () => {
    const deckId = "deck-destroy";
    const first = getDeckDraftCollection(queryClient, deckId);
    destroyDeckDraft(queryClient, deckId);
    const second = getDeckDraftCollection(queryClient, deckId);
    expect(second).not.toBe(first);
    destroyDeckDraft(queryClient, deckId);
  });

  it("is a no-op when the deck has no draft", () => {
    expect(() => destroyDeckDraft(queryClient, "missing")).not.toThrow();
  });
});
