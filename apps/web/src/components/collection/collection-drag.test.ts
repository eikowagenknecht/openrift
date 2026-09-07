import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { resolveDropCopyIds, resolveSelectionDrag } from "./collection-drag";
import type { CardDragData } from "./dnd-types";

const resetSelection = createStoreResetter(useGridSelectionStore);

beforeEach(() => {
  resetIdCounter();
  resetSelection();
});
afterEach(resetSelection);

describe("resolveSelectionDrag", () => {
  const baseDrag: CardDragData = {
    type: "collection-card",
    copyIds: ["grabbed-copy"],
    fromSelection: false,
    isStackDrag: false,
    printing: stubPrinting(),
    previewPrintings: [],
    sourceCollectionId: "col-1",
    sourceAllGroupCopies: false,
  };

  it("leaves a lone (non-selection) drag untouched", () => {
    useGridSelectionStore.setState({ selected: new Set(["other-1", "other-2"]) });
    const resolved = resolveSelectionDrag(baseDrag);
    expect(resolved).toBe(baseDrag);
    expect(resolved.copyIds).toEqual(["grabbed-copy"]);
  });

  it("replaces a selection drag's copyIds with the whole live selection", () => {
    useGridSelectionStore.setState({ selected: new Set(["c1", "c2", "c3"]) });
    const resolved = resolveSelectionDrag({ ...baseDrag, fromSelection: true });
    expect(resolved.copyIds).toEqual(["c1", "c2", "c3"]);
  });
});

describe("resolveDropCopyIds", () => {
  const stack = { copyIds: ["c1", "c2", "c3", "c4"], isStackDrag: true };
  const unit = { copyIds: ["c1", "c2", "c3"], isStackDrag: false };

  it("trims a stack drag to one copy with no modifier", () => {
    expect(resolveDropCopyIds(stack, null)).toEqual(["c1"]);
  });

  it("takes the digit's worth of copies off the front of the stack", () => {
    expect(resolveDropCopyIds(stack, 3)).toEqual(["c1", "c2", "c3"]);
  });

  it("caps a digit larger than the stack at the copies available", () => {
    expect(resolveDropCopyIds(stack, 9)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("takes the whole stack for Shift", () => {
    expect(resolveDropCopyIds(stack, "all")).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("leaves a non-stack drag whole whatever the modifier", () => {
    expect(resolveDropCopyIds(unit, null)).toEqual(["c1", "c2", "c3"]);
    expect(resolveDropCopyIds(unit, 2)).toEqual(["c1", "c2", "c3"]);
  });
});
