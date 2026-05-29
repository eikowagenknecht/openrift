import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { CardDragData, ListEntryDragData } from "@/components/collection/dnd-types";

import { isCompatibleDrop } from "./droppable-sidebar-list";

const STUB_PRINTING = { id: "printing-1" } as unknown as Printing;

const target = {
  listId: "list-b",
  listKind: "card" as const,
  listIntent: "wish" as const,
};

const collectionDrag: CardDragData = {
  type: "collection-card",
  copyIds: ["copy-1"],
  fromSelection: false,
  isStackDrag: false,
  printing: STUB_PRINTING,
  previewPrintings: [STUB_PRINTING],
  sourceCollectionId: "col-1",
};

const listDrag: ListEntryDragData = {
  type: "list-entry",
  entryIds: ["entry-1"],
  sourceListId: "list-a",
  sourceKind: "card",
  sourceIntent: "wish",
  totalQuantity: 1,
  printing: STUB_PRINTING,
  cardName: "Card",
};

describe("isCompatibleDrop", () => {
  it("rejects when nothing is being dragged", () => {
    expect(isCompatibleDrop(undefined, target)).toBe(false);
  });

  it("accepts collection-card drops on any list", () => {
    expect(isCompatibleDrop(collectionDrag, target)).toBe(true);
  });

  it("accepts list-entry drops when kind + intent match and the lists differ", () => {
    expect(isCompatibleDrop(listDrag, target)).toBe(true);
  });

  it("rejects list-entry drops onto the same list", () => {
    expect(isCompatibleDrop({ ...listDrag, sourceListId: target.listId }, target)).toBe(false);
  });

  it("rejects list-entry drops onto a different kind", () => {
    expect(isCompatibleDrop({ ...listDrag, sourceKind: "printing" }, target)).toBe(false);
  });

  it("rejects list-entry drops onto a different intent", () => {
    expect(isCompatibleDrop({ ...listDrag, sourceIntent: "trade" }, target)).toBe(false);
  });
});
