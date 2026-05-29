import { describe, expect, it } from "vitest";

import { isStackSelected, resolveContextActionTarget } from "./stack-selection";

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
      // The printing id is not a copy id; only the copy ids decide.
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
    // Browse mode never aggregates: a lingering selection set must not pull
    // extra cards into the action.
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
