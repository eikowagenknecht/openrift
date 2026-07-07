import { WellKnown } from "@openrift/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLocalDecksStore } from "@/stores/local-decks-store";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import {
  getDeckDraftCollection,
  hydrateDeckDraft,
  useDeckDraftCollection,
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

function wrap(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("getDeckDraftCollection", () => {
  it("returns the same collection for the same deckId on the same client", () => {
    const a = getDeckDraftCollection(queryClient, "local:deck-1");
    const b = getDeckDraftCollection(queryClient, "local:deck-1");
    expect(a).toBe(b);
  });

  it("returns distinct collections for different deck ids", () => {
    const a = getDeckDraftCollection(queryClient, "local:deck-1");
    const b = getDeckDraftCollection(queryClient, "local:deck-2");
    expect(a).not.toBe(b);
  });

  it("isolates collections across QueryClients", () => {
    const a = getDeckDraftCollection(queryClient, "local:deck-1");
    const other = new QueryClient();
    const b = getDeckDraftCollection(other, "local:deck-1");
    expect(a).not.toBe(b);
    other.clear();
  });
});

describe("useDeckDraftCollection (backend picking)", () => {
  it("resolves a draft for local deck ids, even with no session", () => {
    const { result } = renderHook(() => useDeckDraftCollection("local:deck-1"), {
      wrapper: wrap(queryClient),
    });
    expect(result.current).not.toBeNull();
  });

  it("returns null for server deck ids — those read the synced shape", () => {
    const { result } = renderHook(
      () => useDeckDraftCollection("11111111-1111-1111-1111-111111111111"),
      { wrapper: wrap(queryClient) },
    );
    expect(result.current).toBeNull();
  });
});

describe("hydrateDeckDraft", () => {
  it("seeds a fresh collection with the given cards", () => {
    const cards = [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 2 }),
      stubDeckBuilderCard({ cardId: "c2", zone: "sideboard", quantity: 1 }),
    ];
    hydrateDeckDraft(queryClient, "local:hydrate-fresh", cards);
    const stored = [...getDeckDraftCollection(queryClient, "local:hydrate-fresh").values()];
    expect(stored).toHaveLength(2);
    expect(stored.map((c) => c.cardId).toSorted()).toEqual(["c1", "c2"]);
  });

  it("replaces existing contents when re-hydrated", () => {
    hydrateDeckDraft(queryClient, "local:hydrate-replace", [
      stubDeckBuilderCard({ cardId: "old", zone: "main", quantity: 3 }),
    ]);
    hydrateDeckDraft(queryClient, "local:hydrate-replace", [
      stubDeckBuilderCard({ cardId: "new", zone: "sideboard", quantity: 1 }),
    ]);
    const stored = [...getDeckDraftCollection(queryClient, "local:hydrate-replace").values()];
    expect(stored).toHaveLength(1);
    expect(stored[0].cardId).toBe("new");
  });

  it("updates the quantity of matching entries in place", () => {
    hydrateDeckDraft(queryClient, "local:hydrate-update", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 1 }),
    ]);
    hydrateDeckDraft(queryClient, "local:hydrate-update", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 3 }),
    ]);
    const stored = [...getDeckDraftCollection(queryClient, "local:hydrate-update").values()];
    expect(stored[0].quantity).toBe(3);
  });

  it("keeps the same collection instance when re-hydrated", () => {
    const first = getDeckDraftCollection(queryClient, "local:hydrate-same");
    hydrateDeckDraft(queryClient, "local:hydrate-same", [
      stubDeckBuilderCard({ cardId: "c1", zone: "main" }),
    ]);
    const second = getDeckDraftCollection(queryClient, "local:hydrate-same");
    expect(second).toBe(first);
  });
});

describe("localStorage write-through (ADR-035 local decks)", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetStore = createStoreResetter(useLocalDecksStore);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it("writes a local deck's cards to the local store after the debounce", async () => {
    const localId = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED);
    const collection = getDeckDraftCollection(queryClient, localId);

    collection.insert(stubDeckBuilderCard({ cardId: "card-a", zone: "main", quantity: 2 }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(useLocalDecksStore.getState().decks[localId]?.cards).toEqual([
      { cardId: "card-a", zone: "main", quantity: 2, preferredPrintingId: null },
    ]);
  });

  it("coalesces rapid edits into one write-through", async () => {
    const localId = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED);
    const collection = getDeckDraftCollection(queryClient, localId);
    const setCardsSpy = vi.spyOn(useLocalDecksStore.getState(), "setCards");

    collection.insert(stubDeckBuilderCard({ cardId: "card-a", zone: "main", quantity: 1 }));
    await vi.advanceTimersByTimeAsync(500);
    collection.insert(stubDeckBuilderCard({ cardId: "card-b", zone: "main", quantity: 1 }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(setCardsSpy).toHaveBeenCalledOnce();
    expect(useLocalDecksStore.getState().decks[localId]?.cards).toHaveLength(2);
  });

  it("does not write through while hydrating", async () => {
    const localId = useLocalDecksStore.getState().createDeck(WellKnown.deckFormat.CONSTRUCTED);
    const setCardsSpy = vi.spyOn(useLocalDecksStore.getState(), "setCards");

    hydrateDeckDraft(queryClient, localId, [
      stubDeckBuilderCard({ cardId: "c1", zone: "main", quantity: 1 }),
    ]);
    await vi.advanceTimersByTimeAsync(2000);

    expect(setCardsSpy).not.toHaveBeenCalled();
  });
});
