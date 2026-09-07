import type { Printing } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { StackedEntry } from "@/lib/stacked-entry";
import { resetIdCounter, stubPrinting } from "@/test/factories";

import { computeDragSelectionSummary, dragSelectionNoun } from "./collection-drag";

beforeEach(resetIdCounter);

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
