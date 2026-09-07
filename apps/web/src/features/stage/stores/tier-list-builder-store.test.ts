import {
  MAX_CARDS_PER_TIER,
  MAX_TIER_LIST_CARDS,
  MAX_TIER_ROWS,
} from "@openrift/shared/contracts/tier-lists";
import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useTierListBuilderStore } from "./tier-list-builder-store";

const reset = createStoreResetter(useTierListBuilderStore);

function tier(label: string, cardIds: string[]): TierRow {
  return { label, cards: cardIds.map((cardId) => ({ cardId, printingId: null })) };
}

function board(): TierRow[] {
  return [tier("S", ["card-1", "card-2"]), tier("A", ["card-3"]), tier("B", [])];
}

function state() {
  return useTierListBuilderStore.getState();
}

function rowsByLabel(): Record<string, string[]> {
  return Object.fromEntries(
    state().rows.map((current) => [current.label, current.cards.map((card) => card.cardId)]),
  );
}

function pinnedPrinting(cardId: string): string | null | undefined {
  return state()
    .rows.flatMap((current) => current.cards)
    .find((card) => card.cardId === cardId)?.printingId;
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
    expect(incoming[0]?.cards.map((card) => card.cardId)).toEqual(["card-1", "card-2"]);
  });

  it("replaces a previous draft wholesale", () => {
    state().load("list-2", [tier("Only", ["card-9"])]);
    expect(state().listId).toBe("list-2");
    expect(state().rows).toHaveLength(1);
    expect([...state().rowIndexByCardId.keys()]).toEqual(["card-9"]);
  });
});

describe("assign caps", () => {
  function ids(prefix: string, count: number): string[] {
    return Array.from({ length: count }, (_unused, index) => `${prefix}-${index}`);
  }

  it("refuses to grow a row past the per-tier cap", () => {
    state().load("list-caps", [tier("S", ids("full", MAX_CARDS_PER_TIER)), tier("A", [])]);
    state().assign("card-9", 0);
    expect(rowsByLabel().S).toHaveLength(MAX_CARDS_PER_TIER);
    expect(state().dirty).toBe(false);
  });

  it("still allows reordering within a full row", () => {
    state().load("list-caps", [tier("S", ids("full", MAX_CARDS_PER_TIER))]);
    state().assign(`full-${MAX_CARDS_PER_TIER - 1}`, 0, { position: 0 });
    expect(rowsByLabel().S?.[0]).toBe(`full-${MAX_CARDS_PER_TIER - 1}`);
    expect(rowsByLabel().S).toHaveLength(MAX_CARDS_PER_TIER);
  });

  it("refuses to grow the board past the total cap, while still allowing moves", () => {
    state().load("list-total", [
      tier("S", ids("a", MAX_CARDS_PER_TIER)),
      tier("A", ids("b", MAX_CARDS_PER_TIER)),
      tier("B", ids("c", MAX_TIER_LIST_CARDS - 2 * MAX_CARDS_PER_TIER)),
    ]);
    state().assign("card-9", 2);
    expect(rowsByLabel().B).toHaveLength(MAX_TIER_LIST_CARDS - 2 * MAX_CARDS_PER_TIER);

    state().assign("a-0", 2);
    expect(rowsByLabel().B).toHaveLength(MAX_TIER_LIST_CARDS - 2 * MAX_CARDS_PER_TIER + 1);
    expect(rowsByLabel().S).toHaveLength(MAX_CARDS_PER_TIER - 1);
  });
});

describe("assign", () => {
  it("appends a pool card to the end of a row", () => {
    state().assign("card-9", 1);
    expect(rowsByLabel().A).toEqual(["card-3", "card-9"]);
    expect(state().dirty).toBe(true);
  });

  it("inserts at a position when one is given", () => {
    state().assign("card-9", 0, { position: 1 });
    expect(rowsByLabel().S).toEqual(["card-1", "card-9", "card-2"]);
  });

  it("moves a ranked card instead of duplicating it", () => {
    state().assign("card-1", 1);
    expect(rowsByLabel().S).toEqual(["card-2"]);
    expect(rowsByLabel().A).toEqual(["card-3", "card-1"]);
    expect(state().rowIndexByCardId.size).toBe(3);
  });

  it("reorders within a row when dragging leftwards", () => {
    state().assign("card-2", 0, { position: 0 });
    expect(rowsByLabel().S).toEqual(["card-2", "card-1"]);
  });

  it("lands before the target when dragging rightwards within a row", () => {
    state().load("list-4", [tier("S", ["a", "b", "c"])]);
    state().assign("a", 0, { position: 2 });
    expect(rowsByLabel().S).toEqual(["b", "a", "c"]);
  });

  it("does not shift when the card comes from a different row", () => {
    state().load("list-4", [tier("S", ["a", "b", "c"]), tier("A", ["x"])]);
    state().assign("x", 0, { position: 2 });
    expect(rowsByLabel().S).toEqual(["a", "b", "x", "c"]);
    expect(rowsByLabel().A).toEqual([]);
  });

  it("clamps a position past the end of the row", () => {
    state().assign("card-9", 1, { position: 99 });
    expect(rowsByLabel().A).toEqual(["card-3", "card-9"]);
  });

  it("clamps a negative position to the front", () => {
    state().assign("card-9", 1, { position: -5 });
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

describe("assign printings", () => {
  it("pins the printing the card was ranked with", () => {
    state().assign("card-9", 0, { printingId: "printing-alt" });
    expect(pinnedPrinting("card-9")).toBe("printing-alt");
  });

  it("leaves an entry on the default printing when none is given", () => {
    state().assign("card-9", 0);
    expect(pinnedPrinting("card-9")).toBeNull();
  });

  it("keeps the pinned printing when the card moves to another tier", () => {
    state().assign("card-9", 0, { printingId: "printing-alt" });
    state().assign("card-9", 1);
    expect(state().rowIndexByCardId.get("card-9")).toBe(1);
    expect(pinnedPrinting("card-9")).toBe("printing-alt");
  });

  it("re-pins when the move names a different printing", () => {
    state().assign("card-9", 0, { printingId: "printing-alt" });
    state().assign("card-9", 1, { printingId: "printing-other" });
    expect(pinnedPrinting("card-9")).toBe("printing-other");
  });

  it("clears the pin when the move explicitly names none", () => {
    state().assign("card-9", 0, { printingId: "printing-alt" });
    state().assign("card-9", 1, { printingId: null });
    expect(pinnedPrinting("card-9")).toBeNull();
  });
});

describe("setPrinting", () => {
  it("repins a ranked card without moving it", () => {
    state().setPrinting("card-1", "printing-alt");
    expect(pinnedPrinting("card-1")).toBe("printing-alt");
    expect(rowsByLabel().S).toEqual(["card-1", "card-2"]);
    expect(state().dirty).toBe(true);
  });

  it("falls back to the default printing when cleared", () => {
    state().setPrinting("card-1", "printing-alt");
    state().setPrinting("card-1", null);
    expect(pinnedPrinting("card-1")).toBeNull();
  });

  it("is a no-op for a card that isn't ranked", () => {
    state().setPrinting("card-unknown", "printing-alt");
    expect(state().dirty).toBe(false);
  });

  it("is a no-op when the printing is already pinned", () => {
    state().setPrinting("card-1", "printing-alt");
    state().markSaved(state().rows);
    state().setPrinting("card-1", "printing-alt");
    expect(state().dirty).toBe(false);
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
    expect(state().rows.at(-1)).toEqual({ label: "F", cards: [] });
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
      [..."ABCDEFGHIJK"].map((label) => tier(label, [])),
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
    expect(state().rows[0]).toEqual(tier("Broken", ["card-1", "card-2"]));
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

describe("the unranked row", () => {
  it("goes on at the bottom, flagged", () => {
    state().addUnrankedRow();

    const rows = state().rows;
    expect(rows.at(-1)).toMatchObject({ label: "Unranked", unranked: true });
    expect(rows.filter((row) => row.unranked === true)).toHaveLength(1);
  });

  it("is refused a second time", () => {
    state().addUnrankedRow();
    state().addUnrankedRow();

    expect(state().rows.filter((row) => row.unranked === true)).toHaveLength(1);
  });

  it("keeps the bottom when a ranked row is added after it", () => {
    state().addUnrankedRow();
    state().addRow();

    expect(state().rows.map((row) => row.label)).toEqual(["S", "A", "B", "F", "Unranked"]);
  });

  it("cannot be dragged out of the bottom slot", () => {
    state().addUnrankedRow();
    const before = state().rows.map((row) => row.label);

    state().moveRow(3, 0);

    expect(state().rows.map((row) => row.label)).toEqual(before);
  });

  it("cannot be displaced by a ranked row moving down", () => {
    state().addUnrankedRow();

    state().moveRow(2, 3);

    expect(state().rows.at(-1)?.unranked).toBe(true);
  });

  it("still lets ranked rows reorder among themselves", () => {
    state().addUnrankedRow();

    state().moveRow(0, 2);

    expect(state().rows.map((row) => row.label)).toEqual(["A", "B", "S", "Unranked"]);
  });

  it("holds cards like any other row", () => {
    state().addUnrankedRow();

    state().assign("card-1", 3);

    expect(state().rowIndexByCardId.get("card-1")).toBe(3);
    expect(
      state()
        .rows.at(-1)
        ?.cards.map((card) => card.cardId),
    ).toEqual(["card-1"]);
  });

  it("keeps its flag through a card edit", () => {
    state().addUnrankedRow();

    state().assign("card-1", 3);
    state().unassign("card-1");

    expect(state().rows.at(-1)?.unranked).toBe(true);
  });

  it("is refused once the board is full", () => {
    while (state().rows.length < MAX_TIER_ROWS) {
      state().addRow();
    }

    state().addUnrankedRow();

    expect(state().rows).toHaveLength(MAX_TIER_ROWS);
    expect(state().rows.some((row) => row.unranked === true)).toBe(false);
  });

  it("survives a load, and a board without one has no flagged rows", () => {
    state().load("list-2", [tier("S", []), { ...tier("Cut", []), unranked: true }]);
    expect(state().rows.at(-1)?.unranked).toBe(true);

    state().load("list-3", board());
    expect(state().rows.some((row) => row.unranked === true)).toBe(false);
  });
});

describe("markSaved and reset", () => {
  it("clears dirty while keeping the board", () => {
    state().assign("card-9", 0);
    state().markSaved(state().rows);
    expect(state().dirty).toBe(false);
    expect(state().rowIndexByCardId.get("card-9")).toBe(0);
  });

  it("keeps the board dirty when it changed after the save snapshot", () => {
    state().assign("card-9", 0);
    const snapshot = state().rows;
    state().assign("card-10", 1);
    state().markSaved(snapshot);
    expect(state().dirty).toBe(true);
  });

  it("drops the draft entirely", () => {
    state().reset();
    expect(state().listId).toBeNull();
    expect(state().rows).toEqual([]);
    expect(state().rowIndexByCardId.size).toBe(0);
    expect(state().dirty).toBe(false);
  });
});
