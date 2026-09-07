import type { DeckZone } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { useDeckUndoStore } from "@/stores/deck-undo-store";
import { stubDeckBuilderCard } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

const resetStore = createStoreResetter(useDeckUndoStore);

const card = (cardId: string, quantity: number): DeckBuilderCard =>
  stubDeckBuilderCard({ cardId, cardName: cardId, quantity, zone: "main" as DeckZone });

const store = () => useDeckUndoStore.getState();

/** Moves past the burst window so the next record pushes its own step. */
const settle = () => vi.advanceTimersByTime(1000);

beforeEach(() => {
  resetStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetStore();
});

describe("record", () => {
  it("adopts the deck and stacks the snapshot", () => {
    store().record("deck-1", [card("a", 1)]);

    expect(store().deckId).toBe("deck-1");
    expect(store().past).toHaveLength(1);
    expect(store().future).toEqual([]);
  });

  it("clears the stacks when a different deck records", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    store().record("deck-1", [card("a", 2)]);
    settle();
    store().record("deck-2", [card("z", 1)]);

    expect(store().deckId).toBe("deck-2");
    expect(store().past).toHaveLength(1);
    expect(store().past[0][0].cardId).toBe("z");
  });

  it("coalesces a burst of edits into one step", () => {
    store().record("deck-1", [card("a", 1)]);
    vi.advanceTimersByTime(100);
    store().record("deck-1", [card("a", 2)]);
    vi.advanceTimersByTime(100);
    store().record("deck-1", [card("a", 3)]);
    vi.advanceTimersByTime(100);
    store().record("deck-1", [card("a", 4)]);

    expect(store().past).toHaveLength(1);
    expect(store().past[0][0].quantity).toBe(1);
  });

  it("starts a new step once the burst window has passed", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    store().record("deck-1", [card("a", 2)]);

    expect(store().past).toHaveLength(2);
  });

  it("clears the redo branch even mid-burst", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    expect(store().undo("deck-1", [card("a", 2)])).not.toBeNull();
    expect(store().future).toHaveLength(1);

    store().record("deck-1", [card("a", 5)]);
    expect(store().future).toEqual([]);
  });

  it("caps the stack at 100, dropping the oldest", () => {
    for (let index = 0; index < 105; index++) {
      store().record("deck-1", [card("a", index)]);
      settle();
    }

    expect(store().past).toHaveLength(100);
    expect(store().past[0][0].quantity).toBe(5);
    expect(store().past.at(-1)?.[0].quantity).toBe(104);
  });
});

describe("undo and redo", () => {
  it("round-trips an edit", () => {
    const before = [card("a", 1)];
    const after = [card("a", 2)];
    store().record("deck-1", before);

    const undone = store().undo("deck-1", after);
    expect(undone?.[0].quantity).toBe(1);
    expect(store().past).toEqual([]);

    const redone = store().redo("deck-1", undone ?? []);
    expect(redone?.[0].quantity).toBe(2);
    expect(store().past).toHaveLength(1);
    expect(store().future).toEqual([]);
  });

  it("walks back through several steps in order", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    store().record("deck-1", [card("a", 2)]);
    settle();

    expect(store().undo("deck-1", [card("a", 3)])?.[0].quantity).toBe(2);
    expect(store().undo("deck-1", [card("a", 2)])?.[0].quantity).toBe(1);
    expect(store().undo("deck-1", [card("a", 1)])).toBeNull();
  });

  it("returns null on an empty stack", () => {
    expect(store().undo("deck-1", [])).toBeNull();
    expect(store().redo("deck-1", [])).toBeNull();
  });

  it("returns null when the deck id does not match", () => {
    store().record("deck-1", [card("a", 1)]);

    expect(store().undo("deck-2", [card("a", 2)])).toBeNull();
    expect(store().past).toHaveLength(1);
  });

  it("restores an empty deck as an empty array, not null", () => {
    store().record("deck-1", []);

    expect(store().undo("deck-1", [card("a", 1)])).toEqual([]);
  });
});

describe("snapshot isolation", () => {
  it("does not capture the caller's card objects", () => {
    const live = [card("a", 1)];
    store().record("deck-1", live);

    live[0].quantity = 99;

    expect(store().past[0][0].quantity).toBe(1);
  });

  it("hands out copies, so mutating a result cannot corrupt the stack", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    store().record("deck-1", [card("a", 2)]);

    const undone = store().undo("deck-1", [card("a", 3)]);
    if (undone) {
      undone[0].quantity = 42;
    }

    expect(store().past[0][0].quantity).toBe(1);
    expect(store().future[0][0].quantity).toBe(3);
  });

  it("copies the current cards pushed onto the redo stack", () => {
    store().record("deck-1", [card("a", 1)]);
    const current = [card("a", 2)];
    store().undo("deck-1", current);

    current[0].quantity = 99;

    expect(store().future[0][0].quantity).toBe(2);
  });
});

describe("reset", () => {
  it("drops both stacks and adopts the given deck", () => {
    store().record("deck-1", [card("a", 1)]);
    settle();
    store().undo("deck-1", [card("a", 2)]);

    store().reset("deck-1");

    expect(store().past).toEqual([]);
    expect(store().future).toEqual([]);
    expect(store().deckId).toBe("deck-1");
  });

  it("clears the deck id when called with no argument", () => {
    store().record("deck-1", [card("a", 1)]);
    store().reset();

    expect(store().deckId).toBeNull();
    expect(store().past).toEqual([]);
  });

  it("lets the next record start a fresh history", () => {
    store().record("deck-1", [card("a", 1)]);
    store().reset("deck-1");
    store().record("deck-1", [card("a", 7)]);

    expect(store().past).toHaveLength(1);
    expect(store().past[0][0].quantity).toBe(7);
  });
});
