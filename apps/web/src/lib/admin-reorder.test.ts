import { describe, expect, it } from "vitest";

import { swapForReorder } from "./admin-reorder";

interface Row {
  slug: string;
}

const rows: Row[] = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
const bySlug = (row: Row) => row.slug;

describe("swapForReorder", () => {
  it("moves a row up", () => {
    expect(swapForReorder(rows, 2, -1, bySlug)).toEqual(["a", "c", "b"]);
  });

  it("moves a row down", () => {
    expect(swapForReorder(rows, 0, 1, bySlug)).toEqual(["b", "a", "c"]);
  });

  it("returns null when moving the first row up", () => {
    expect(swapForReorder(rows, 0, -1, bySlug)).toBeNull();
  });

  it("returns null when moving the last row down", () => {
    expect(swapForReorder(rows, 2, 1, bySlug)).toBeNull();
  });

  it("returns null for an index outside the list", () => {
    expect(swapForReorder(rows, 5, -1, bySlug)).toBeNull();
    expect(swapForReorder(rows, -1, 1, bySlug)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(swapForReorder([], 0, 1, bySlug)).toBeNull();
  });

  it("leaves the source list untouched", () => {
    const items = [{ slug: "a" }, { slug: "b" }];
    swapForReorder(items, 0, 1, bySlug);
    expect(items.map((item) => bySlug(item))).toEqual(["a", "b"]);
  });

  it("keys rows by whatever field the page reorders on", () => {
    const markers = [{ id: "m1" }, { id: "m2" }];
    expect(swapForReorder(markers, 0, 1, (marker) => marker.id)).toEqual(["m2", "m1"]);
  });
});
