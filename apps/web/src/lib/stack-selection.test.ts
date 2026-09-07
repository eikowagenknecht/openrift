import { describe, expect, it } from "vitest";

import { computeShiftRange, isStackSelected, resolveContextActionTarget } from "./stack-selection";

describe("isStackSelected", () => {
  describe("stacked (cards / printings view)", () => {
    it("is selected when every copy id is in the set", () => {
      expect(isStackSelected(true, "p1", ["c1", "c2"], new Set(["c1", "c2"]))).toBe(true);
    });

    it("is not selected when any copy id is missing", () => {
      expect(isStackSelected(true, "p1", ["c1", "c2"], new Set(["c1"]))).toBe(false);
    });

    it("is not selected when the set is a superset but a copy is missing", () => {
      expect(isStackSelected(true, "p1", ["c1", "c2"], new Set(["c1", "c3", "c4"]))).toBe(false);
    });

    it("is not selected with an empty copy-id list (unowned card)", () => {
      expect(isStackSelected(true, "p1", [], new Set(["c1"]))).toBe(false);
    });

    it("is not selected against an empty selection set", () => {
      expect(isStackSelected(true, "p1", ["c1"], new Set())).toBe(false);
    });

    it("ignores itemId in stacked mode", () => {
      expect(isStackSelected(true, "p1", ["c1"], new Set(["p1"]))).toBe(false);
    });
  });

  describe("copies view (not stacked)", () => {
    it("is selected when the item's own copy id is in the set", () => {
      expect(isStackSelected(false, "c1", ["c1", "c2"], new Set(["c1"]))).toBe(true);
    });

    it("is not selected when the item id is absent", () => {
      expect(isStackSelected(false, "c1", ["c1"], new Set(["c2"]))).toBe(false);
    });

    it("ignores the copyIds list in copies view", () => {
      expect(isStackSelected(false, "c1", ["c2", "c3"], new Set(["c1"]))).toBe(true);
    });
  });
});

describe("computeShiftRange", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const selfId = (item: { id: string }) => [item.id];

  it("walks forward from the anchor to the clicked tile, inclusive", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "b", itemId: "d", idsForItem: selfId }),
    ).toEqual(["b", "c", "d"]);
  });

  it("walks backward when the clicked tile precedes the anchor", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "d", itemId: "b", idsForItem: selfId }),
    ).toEqual(["b", "c", "d"]);
  });

  it("returns just the tile when the anchor is the clicked tile", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "c", itemId: "c", idsForItem: selfId }),
    ).toEqual(["c"]);
  });

  it("returns null when nothing was clicked before", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: null, itemId: "c", idsForItem: selfId }),
    ).toBeNull();
  });

  it("returns null when the anchor is no longer in items (filtered away)", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "gone", itemId: "c", idsForItem: selfId }),
    ).toBeNull();
  });

  it("returns null when the clicked tile is not in items", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "a", itemId: "gone", idsForItem: selfId }),
    ).toBeNull();
  });

  it("returns null for an empty item list", () => {
    expect(
      computeShiftRange({ items: [], lastSelectedItemId: "a", itemId: "b", idsForItem: selfId }),
    ).toBeNull();
  });

  it("accumulates every id a stacked tile stands for", () => {
    const copies: Record<string, string[]> = { a: ["c1", "c2"], b: ["c3"], c: ["c4", "c5"] };
    expect(
      computeShiftRange({
        items,
        lastSelectedItemId: "a",
        itemId: "c",
        idsForItem: (item) => copies[item.id] ?? [],
      }),
    ).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("skips tiles that map to no selectable id", () => {
    expect(
      computeShiftRange({
        items,
        lastSelectedItemId: "a",
        itemId: "d",
        idsForItem: (item) => (item.id === "b" || item.id === "c" ? [] : [item.id]),
      }),
    ).toEqual(["a", "d"]);
  });

  it("returns an empty range, distinct from null, when no tile in it is selectable", () => {
    expect(
      computeShiftRange({ items, lastSelectedItemId: "a", itemId: "c", idsForItem: () => [] }),
    ).toEqual([]);
  });
});

describe("resolveContextActionTarget", () => {
  it("acts on the whole selection when the card is part of it (select mode)", () => {
    const result = resolveContextActionTarget({
      mode: "select",
      stacked: true,
      itemId: "p1",
      cardCopyIds: ["c1", "c2"],
      selected: new Set(["c1", "c2", "c3", "c4"]),
    });
    expect(result.narrowSelectionTo).toBeNull();
    expect([...result.copyIds].sort()).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("narrows the selection to just the card when it is not selected (select mode)", () => {
    const result = resolveContextActionTarget({
      mode: "select",
      stacked: true,
      itemId: "p1",
      cardCopyIds: ["c1", "c2"],
      selected: new Set(["c9"]),
    });
    expect(result.copyIds).toEqual(["c1", "c2"]);
    expect(result.narrowSelectionTo).toEqual(["c1", "c2"]);
  });

  it("acts on just the card without touching selection in browse mode", () => {
    const result = resolveContextActionTarget({
      mode: "browse",
      stacked: true,
      itemId: "p1",
      cardCopyIds: ["c1", "c2"],
      selected: new Set(),
    });
    expect(result.copyIds).toEqual(["c1", "c2"]);
    expect(result.narrowSelectionTo).toBeNull();
  });

  it("does not act on a stale selection in browse mode even if copies happen to be in it", () => {
    const result = resolveContextActionTarget({
      mode: "browse",
      stacked: true,
      itemId: "p1",
      cardCopyIds: ["c1"],
      selected: new Set(["c1", "c2", "c3"]),
    });
    expect(result.copyIds).toEqual(["c1"]);
    expect(result.narrowSelectionTo).toBeNull();
  });

  it("narrows in select mode when the selection is empty", () => {
    const result = resolveContextActionTarget({
      mode: "select",
      stacked: true,
      itemId: "p1",
      cardCopyIds: ["c1"],
      selected: new Set(),
    });
    expect(result.copyIds).toEqual(["c1"]);
    expect(result.narrowSelectionTo).toEqual(["c1"]);
  });

  it("targets the single copy id in copies view", () => {
    const result = resolveContextActionTarget({
      mode: "browse",
      stacked: false,
      itemId: "copy-1",
      cardCopyIds: ["copy-1"],
      selected: new Set(),
    });
    expect(result.copyIds).toEqual(["copy-1"]);
    expect(result.narrowSelectionTo).toBeNull();
  });
});
