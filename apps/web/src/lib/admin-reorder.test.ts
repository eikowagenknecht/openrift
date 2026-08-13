import { describe, expect, it } from "vitest";

import { flatReorder, treeReorder } from "./admin-reorder";

interface Row {
  slug: string;
}

const rows: Row[] = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
const bySlug = (row: Row) => row.slug;

describe("flatReorder", () => {
  const moves = flatReorder(rows, bySlug);

  it("moves a row up", () => {
    expect(moves.step("c", -1)).toEqual(["a", "c", "b"]);
  });

  it("moves a row down", () => {
    expect(moves.step("a", 1)).toEqual(["b", "a", "c"]);
  });

  it("returns null when moving the first row up", () => {
    expect(moves.step("a", -1)).toBeNull();
  });

  it("returns null when moving the last row down", () => {
    expect(moves.step("c", 1)).toBeNull();
  });

  it("returns null for a key outside the list", () => {
    expect(moves.step("zz", -1)).toBeNull();
    expect(moves.moveTo("zz", "a")).toBeNull();
    expect(moves.moveTo("a", "zz")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(flatReorder([], bySlug).step("a", 1)).toBeNull();
  });

  it("drops a row onto a later row", () => {
    expect(moves.moveTo("a", "c")).toEqual(["b", "c", "a"]);
  });

  it("drops a row onto an earlier row", () => {
    expect(moves.moveTo("c", "a")).toEqual(["c", "a", "b"]);
  });

  it("returns null when dropping a row onto itself", () => {
    expect(moves.moveTo("b", "b")).toBeNull();
  });

  it("moves only the dragged row", () => {
    expect(moves.block("b")).toEqual(["b"]);
  });

  it("answers the cheap checks the same way as the moves themselves", () => {
    expect(moves.canStep("a", -1)).toBe(false);
    expect(moves.canStep("a", 1)).toBe(true);
    expect(moves.canStep("c", 1)).toBe(false);
    expect(moves.canDropOn("a", "c")).toBe(true);
    expect(moves.canDropOn("b", "b")).toBe(false);
    expect(moves.canDropOn("a", "zz")).toBe(false);
  });

  it("leaves the source list untouched", () => {
    const items = [{ slug: "a" }, { slug: "b" }];
    flatReorder(items, bySlug).step("a", 1);
    expect(items.map((item) => bySlug(item))).toEqual(["a", "b"]);
  });

  it("keys rows by whatever field the page reorders on", () => {
    const markers = [{ id: "m1" }, { id: "m2" }];
    expect(flatReorder(markers, (marker) => marker.id).step("m1", 1)).toEqual(["m2", "m1"]);
  });
});

interface Node {
  id: string;
  parentId: string | null;
}

// Depth-first, the order the channels table renders:
//   root-a
//     a1
//       a1x
//     a2
//   root-b
//     b1
const tree: Node[] = [
  { id: "root-a", parentId: null },
  { id: "a1", parentId: "root-a" },
  { id: "a1x", parentId: "a1" },
  { id: "a2", parentId: "root-a" },
  { id: "root-b", parentId: null },
  { id: "b1", parentId: "root-b" },
];

const treeMoves = treeReorder(
  tree,
  (node) => node.id,
  (node) => node.parentId,
);

describe("treeReorder", () => {
  it("carries a row's subtree with it", () => {
    expect(treeMoves.block("root-a")).toEqual(["root-a", "a1", "a1x", "a2"]);
    expect(treeMoves.block("a1")).toEqual(["a1", "a1x"]);
    expect(treeMoves.block("b1")).toEqual(["b1"]);
  });

  it("steps a top-level row past the next root's whole subtree", () => {
    expect(treeMoves.step("root-a", 1)).toEqual(["root-b", "b1", "root-a", "a1", "a1x", "a2"]);
  });

  it("steps a child past its sibling, children included", () => {
    expect(treeMoves.step("a1", 1)).toEqual(["root-a", "a2", "a1", "a1x", "root-b", "b1"]);
  });

  it("returns null for the first and last row of a sibling group", () => {
    expect(treeMoves.step("a1", -1)).toBeNull();
    expect(treeMoves.step("a2", 1)).toBeNull();
    expect(treeMoves.step("a1x", 1)).toBeNull();
  });

  it("resolves a drop inside a sibling's subtree to that sibling", () => {
    // root-a dropped on b1 lands after root-b, b1's parent.
    expect(treeMoves.moveTo("root-a", "b1")).toEqual(["root-b", "b1", "root-a", "a1", "a1x", "a2"]);
  });

  it("refuses a drop in another branch", () => {
    expect(treeMoves.moveTo("a1", "b1")).toBeNull();
    expect(treeMoves.moveTo("a1", "root-b")).toBeNull();
  });

  it("refuses a drop inside the dragged row's own subtree", () => {
    expect(treeMoves.moveTo("root-a", "a1x")).toBeNull();
    expect(treeMoves.moveTo("a1", "a1x")).toBeNull();
  });

  it("refuses a drop on the dragged row's parent", () => {
    expect(treeMoves.moveTo("a1", "root-a")).toBeNull();
  });

  // What the table asks per row while a drag is in flight, to keep the rows a
  // channel can't land on from accepting it.
  it("answers the cheap checks the same way as the moves themselves", () => {
    expect(treeMoves.canDropOn("root-a", "b1")).toBe(true);
    expect(treeMoves.canDropOn("a1", "b1")).toBe(false);
    expect(treeMoves.canDropOn("a1", "a2")).toBe(true);
    expect(treeMoves.canDropOn("root-a", "a1x")).toBe(false);
    expect(treeMoves.canStep("a1x", -1)).toBe(false);
    expect(treeMoves.canStep("a1", 1)).toBe(true);
  });

  it("survives a parent cycle without hanging", () => {
    const cyclic = treeReorder(
      [
        { id: "x", parentId: "y" },
        { id: "y", parentId: "x" },
      ],
      (node) => node.id,
      (node) => node.parentId,
    );
    expect(cyclic.block("x")).toEqual(["x", "y"]);
    expect(cyclic.moveTo("x", "y")).toBeNull();
  });
});
