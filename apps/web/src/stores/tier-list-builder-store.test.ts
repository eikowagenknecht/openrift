import type { TierRow } from "@openrift/shared";
import { MAX_TIER_ROWS } from "@openrift/shared/contracts/tier-lists";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useTierListBuilderStore } from "./tier-list-builder-store";

const reset = createStoreResetter(useTierListBuilderStore);

function board(): TierRow[] {
  return [
    { label: "S", cardIds: ["card-1", "card-2"] },
    { label: "A", cardIds: ["card-3"] },
    { label: "B", cardIds: [] },
  ];
}

/** @returns The store's current state, for assertions. */
function state() {
  return useTierListBuilderStore.getState();
}

/** @returns The board as `label → cardIds`, which reads better in assertions. */
function rowsByLabel(): Record<string, string[]> {
  return Object.fromEntries(state().rows.map((row) => [row.label, row.cardIds]));
}

beforeEach(() => {
  reset();
  state().load("list-1", board());
});

afterEach(reset);

describe("load", () => {
  it("adopts the list's saved board without carrying a dirty flag", () => {
    expect(state().listId).toBe("list-1");
    expect(state().rows).toHaveLength(3);
    expect(state().dirty).toBe(false);
  });

  it("indexes every ranked card by its row", () => {
    expect([...state().rowIndexByCardId.entries()].toSorted()).toEqual([
      ["card-1", 0],
      ["card-2", 0],
      ["card-3", 1],
    ]);
  });

  it("copies the incoming rows rather than aliasing them", () => {
    const incoming = board();
    state().load("list-2", incoming);
    state().assign("card-9", 0);
    expect(incoming[0]?.cardIds).toEqual(["card-1", "card-2"]);
  });

  it("replaces a previous draft wholesale", () => {
    state().load("list-2", [{ label: "Only", cardIds: ["card-9"] }]);
    expect(state().listId).toBe("list-2");
    expect(state().rows).toHaveLength(1);
    expect([...state().rowIndexByCardId.keys()]).toEqual(["card-9"]);
  });
});

describe("assign", () => {
  it("appends a pool card to the end of a row", () => {
    state().assign("card-9", 1);
    expect(rowsByLabel().A).toEqual(["card-3", "card-9"]);
    expect(state().dirty).toBe(true);
  });

  it("inserts at a position when one is given", () => {
    state().assign("card-9", 0, 1);
    expect(rowsByLabel().S).toEqual(["card-1", "card-9", "card-2"]);
  });

  it("moves a ranked card instead of duplicating it", () => {
    state().assign("card-1", 1);
    expect(rowsByLabel().S).toEqual(["card-2"]);
    expect(rowsByLabel().A).toEqual(["card-3", "card-1"]);
    expect(state().rowIndexByCardId.size).toBe(3);
  });

  it("reorders within a row when dragging leftwards", () => {
    state().assign("card-2", 0, 0);
    expect(rowsByLabel().S).toEqual(["card-2", "card-1"]);
  });

  it("lands before the target when dragging rightwards within a row", () => {
    state().load("list-4", [{ label: "S", cardIds: ["a", "b", "c"] }]);
    // Dropping "a" onto "c" (index 2) must place it before "c", not after —
    // lifting "a" out first shifts "c" down to index 1.
    state().assign("a", 0, 2);
    expect(rowsByLabel().S).toEqual(["b", "a", "c"]);
  });

  it("does not shift when the card comes from a different row", () => {
    state().load("list-4", [
      { label: "S", cardIds: ["a", "b", "c"] },
      { label: "A", cardIds: ["x"] },
    ]);
    state().assign("x", 0, 2);
    expect(rowsByLabel().S).toEqual(["a", "b", "x", "c"]);
    expect(rowsByLabel().A).toEqual([]);
  });

  it("clamps a position past the end of the row", () => {
    state().assign("card-9", 1, 99);
    expect(rowsByLabel().A).toEqual(["card-3", "card-9"]);
  });

  it("clamps a negative position to the front", () => {
    state().assign("card-9", 1, -5);
    expect(rowsByLabel().A).toEqual(["card-9", "card-3"]);
  });

  it("ignores a row index off the end of the board", () => {
    state().assign("card-9", 9);
    expect(state().rowIndexByCardId.has("card-9")).toBe(false);
    expect(state().dirty).toBe(false);
  });

  it("ignores a negative row index", () => {
    state().assign("card-9", -1);
    expect(state().dirty).toBe(false);
  });

  it("fills an empty row", () => {
    state().assign("card-9", 2);
    expect(rowsByLabel().B).toEqual(["card-9"]);
  });
});

describe("unassign", () => {
  it("takes a card off the board", () => {
    state().unassign("card-1");
    expect(rowsByLabel().S).toEqual(["card-2"]);
    expect(state().rowIndexByCardId.has("card-1")).toBe(false);
    expect(state().dirty).toBe(true);
  });

  it("is a no-op for a card that was never ranked", () => {
    state().unassign("card-unknown");
    expect(state().dirty).toBe(false);
    expect(state().rowIndexByCardId.size).toBe(3);
  });
});

describe("addRow", () => {
  it("appends a row with the next free letter", () => {
    state().addRow();
    expect(state().rows.at(-1)).toEqual({ label: "F", cardIds: [] });
    expect(state().dirty).toBe(true);
  });

  it("skips a letter already used by a renamed row", () => {
    state().renameRow(2, "F");
    state().addRow();
    expect(state().rows.at(-1)?.label).toBe("G");
  });

  it("stops at the row cap", () => {
    while (state().rows.length < MAX_TIER_ROWS) {
      state().addRow();
    }
    const before = state().rows.length;
    state().addRow();
    expect(state().rows).toHaveLength(before);
    expect(before).toBe(MAX_TIER_ROWS);
  });

  it("still finds a free letter on a board one short of the cap", () => {
    state().load(
      "list-3",
      [..."ABCDEFGHIJK"].map((label) => ({ label, cardIds: [] })),
    );
    state().addRow();
    expect(state().rows.at(-1)?.label).toBe("L");
    expect(state().rows).toHaveLength(MAX_TIER_ROWS);
  });
});

describe("removeRow", () => {
  it("drops the row and returns its cards to the pool", () => {
    state().removeRow(0);
    expect(state().rows.map((row) => row.label)).toEqual(["A", "B"]);
    expect([...state().rowIndexByCardId.entries()]).toEqual([["card-3", 0]]);
    expect(state().dirty).toBe(true);
  });

  it("ignores an index off the end of the board", () => {
    state().removeRow(9);
    expect(state().rows).toHaveLength(3);
    expect(state().dirty).toBe(false);
  });

  it("can empty the board entirely", () => {
    state().removeRow(0);
    state().removeRow(0);
    state().removeRow(0);
    expect(state().rows).toEqual([]);
    expect(state().rowIndexByCardId.size).toBe(0);
  });
});

describe("renameRow", () => {
  it("renames a row without touching its cards", () => {
    state().renameRow(0, "Broken");
    expect(state().rows[0]).toEqual({ label: "Broken", cardIds: ["card-1", "card-2"] });
    expect(state().dirty).toBe(true);
  });

  it("is a no-op when the label is unchanged", () => {
    state().renameRow(0, "S");
    expect(state().dirty).toBe(false);
  });

  it("ignores an unknown row index", () => {
    state().renameRow(9, "Nope");
    expect(state().dirty).toBe(false);
  });
});

describe("moveRow", () => {
  it("reorders the board", () => {
    state().moveRow(0, 2);
    expect(state().rows.map((row) => row.label)).toEqual(["A", "B", "S"]);
    expect(state().dirty).toBe(true);
  });

  it("moves a row upward", () => {
    state().moveRow(2, 0);
    expect(state().rows.map((row) => row.label)).toEqual(["B", "S", "A"]);
  });

  it("is a no-op when the source and target match", () => {
    state().moveRow(1, 1);
    expect(state().dirty).toBe(false);
  });

  it("ignores an out-of-range index in either position", () => {
    state().moveRow(0, 9);
    state().moveRow(-1, 0);
    expect(state().rows.map((row) => row.label)).toEqual(["S", "A", "B"]);
    expect(state().dirty).toBe(false);
  });
});

describe("markSaved and reset", () => {
  it("clears dirty while keeping the board", () => {
    state().assign("card-9", 0);
    state().markSaved();
    expect(state().dirty).toBe(false);
    expect(state().rowIndexByCardId.get("card-9")).toBe(0);
  });

  it("drops the draft entirely", () => {
    state().reset();
    expect(state().listId).toBeNull();
    expect(state().rows).toEqual([]);
    expect(state().rowIndexByCardId.size).toBe(0);
    expect(state().dirty).toBe(false);
  });
});
