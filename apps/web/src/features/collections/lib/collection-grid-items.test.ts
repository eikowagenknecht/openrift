import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { buildCollectionGridItems, copyIdsShareOneCard } from "./collection-grid-items";
import type { StackedEntry } from "./stacked-entry";

const owned = stubPrinting();
const unowned = stubPrinting();

const stack: StackedEntry = {
  printingId: owned.id,
  printing: owned,
  copyIds: ["c1", "c2"],
};

const stackByPrintingId = new Map([[owned.id, stack]]);
const collectionIdByCopyId = new Map([
  ["c1", "box-1"],
  ["c2", "box-2"],
]);

describe("buildCollectionGridItems", () => {
  it("keeps unowned printings in library mode", () => {
    const { items, stackByItemId } = buildCollectionGridItems(
      [owned, unowned],
      stackByPrintingId,
      collectionIdByCopyId,
      true,
      true,
    );

    expect(items.map((item) => item.id)).toEqual([owned.id, unowned.id]);
    expect(stackByItemId.get(owned.id)).toBe(stack);
    expect(stackByItemId.has(unowned.id)).toBe(false);
  });

  it("drops unowned printings outside library mode", () => {
    const { items } = buildCollectionGridItems(
      [owned, unowned],
      stackByPrintingId,
      collectionIdByCopyId,
      false,
      true,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(owned.id);
  });

  it("expands a stack into one item per copy when unstacked", () => {
    const { items, stackByItemId } = buildCollectionGridItems(
      [owned, unowned],
      stackByPrintingId,
      collectionIdByCopyId,
      false,
      false,
    );

    expect(items.map((item) => item.id)).toEqual(["c1", "c2"]);
    expect(items.map((item) => item.collectionId)).toEqual(["box-1", "box-2"]);
    expect(stackByItemId.get("c1")).toBe(stack);
    expect(stackByItemId.get("c2")).toBe(stack);
  });

  it("leaves the collection id undefined for a copy it doesn't know", () => {
    const { items } = buildCollectionGridItems([owned], stackByPrintingId, new Map(), false, false);

    expect(items[0]?.collectionId).toBeUndefined();
  });
});

describe("copyIdsShareOneCard", () => {
  const first = stubPrinting();
  const second = stubPrinting();
  const stacks: StackedEntry[] = [
    { printingId: first.id, printing: first, copyIds: ["a1", "a2"] },
    { printingId: second.id, printing: second, copyIds: ["b1"] },
  ];

  it("is true for a single copy", () => {
    expect(copyIdsShareOneCard(["b1"], stacks)).toBe(true);
  });

  it("is true for two copies of the same card", () => {
    expect(copyIdsShareOneCard(["a1", "a2"], stacks)).toBe(true);
  });

  it("is false across two cards", () => {
    expect(copyIdsShareOneCard(["a1", "b1"], stacks)).toBe(false);
  });

  it("is true when no copy resolves to a stack", () => {
    expect(copyIdsShareOneCard(["x1", "x2"], stacks)).toBe(true);
  });
});
