import type { Printing } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { StackedEntry } from "@/hooks/use-stacked-copies";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { resetIdCounter, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import {
  computeDragSelectionSummary,
  dragSelectionNoun,
  resolveSelectionDrag,
} from "./collection-drag";
import type { CardDragData } from "./dnd-types";

const resetSelection = createStoreResetter(useGridSelectionStore);

beforeEach(() => {
  resetIdCounter();
  resetSelection();
});
afterEach(resetSelection);

// Builds a stacked grid (one tile per printing, keyed by printingId).
function stackedGrid(copyIdsByPrinting: string[][]): {
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
  printings: Printing[];
} {
  const items: CardViewerItem[] = [];
  const stackByItemId = new Map<string, StackedEntry>();
  const printings: Printing[] = [];
  for (const copyIds of copyIdsByPrinting) {
    const printing = stubPrinting();
    printings.push(printing);
    stackByItemId.set(printing.id, { printingId: printing.id, printing, copyIds });
    items.push({ id: printing.id, printing });
  }
  return { items, stackByItemId, printings };
}

// Builds a copies grid (one tile per copy, keyed by copyId).
function copiesGrid(copyIdsByPrinting: string[][]): {
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
} {
  const items: CardViewerItem[] = [];
  const stackByItemId = new Map<string, StackedEntry>();
  for (const copyIds of copyIdsByPrinting) {
    const printing = stubPrinting();
    const entry: StackedEntry = { printingId: printing.id, printing, copyIds };
    for (const copyId of copyIds) {
      stackByItemId.set(copyId, entry);
      items.push({ id: copyId, printing });
    }
  }
  return { items, stackByItemId };
}

describe("computeDragSelectionSummary", () => {
  it("returns nothing in browse mode", () => {
    const { items, stackByItemId } = stackedGrid([["c1"]]);
    const result = computeDragSelectionSummary({
      mode: "browse",
      selected: new Set(["c1"]),
      items,
      stackByItemId,
      stacked: true,
    });
    expect(result).toEqual({ printings: [], count: 0 });
  });

  it("returns nothing when the selection is empty", () => {
    const { items, stackByItemId } = stackedGrid([["c1"]]);
    const result = computeDragSelectionSummary({
      mode: "select",
      selected: new Set(),
      items,
      stackByItemId,
      stacked: true,
    });
    expect(result).toEqual({ printings: [], count: 0 });
  });

  it("counts each selected printing tile and fans the first three", () => {
    const { items, stackByItemId, printings } = stackedGrid([
      ["c1"],
      ["c2"],
      ["c3"],
      ["c4"],
      ["c5"],
    ]);
    const result = computeDragSelectionSummary({
      mode: "select",
      selected: new Set(["c1", "c2", "c3", "c4", "c5"]),
      items,
      stackByItemId,
      stacked: true,
    });
    expect(result.count).toBe(5);
    expect(result.printings).toEqual([printings[0], printings[1], printings[2]]);
  });

  it("counts a multi-copy printing as a single tile", () => {
    const { items, stackByItemId, printings } = stackedGrid([["c1", "c2", "c3"]]);
    const result = computeDragSelectionSummary({
      mode: "select",
      selected: new Set(["c1", "c2", "c3"]),
      items,
      stackByItemId,
      stacked: true,
    });
    expect(result.count).toBe(1);
    expect(result.printings).toEqual([printings[0]]);
  });

  it("counts only the tiles with a selected copy", () => {
    const { items, stackByItemId, printings } = stackedGrid([["c1"], ["c2"], ["c3"]]);
    const result = computeDragSelectionSummary({
      mode: "select",
      selected: new Set(["c1", "c3"]),
      items,
      stackByItemId,
      stacked: true,
    });
    expect(result.count).toBe(2);
    expect(result.printings).toEqual([printings[0], printings[2]]);
  });

  it("counts individual copies in copies view and dedupes the fan", () => {
    const { items, stackByItemId } = copiesGrid([["c1", "c2", "c3"]]);
    const result = computeDragSelectionSummary({
      mode: "select",
      selected: new Set(["c1", "c2"]),
      items,
      stackByItemId,
      stacked: false,
    });
    expect(result.count).toBe(2);
    expect(result.printings).toHaveLength(1);
  });
});

describe("dragSelectionNoun", () => {
  it("maps each view to its singular unit", () => {
    expect(dragSelectionNoun("cards")).toBe("card");
    expect(dragSelectionNoun("printings")).toBe("printing");
    expect(dragSelectionNoun("copies")).toBe("copy");
  });
});

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
    // Regression: dragging one tile of a multi-selection must move every
    // selected copy, not just the grabbed tile's copy.
    useGridSelectionStore.setState({ selected: new Set(["c1", "c2", "c3"]) });
    const resolved = resolveSelectionDrag({ ...baseDrag, fromSelection: true });
    expect(resolved.copyIds).toEqual(["c1", "c2", "c3"]);
  });
});
