import { describe, expect, it } from "vitest";

import { reorderInPlace } from "./reorder-in-place";

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" },
  { id: "d", name: "Delta" },
];

describe("reorderInPlace", () => {
  it("returns a new array (does not mutate the input)", () => {
    const result = reorderInPlace(rows, ["c", "a"]);
    expect(result).not.toBe(rows);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("reorders ids only within the slots they originally occupied", () => {
    const result = reorderInPlace(rows, ["c", "a"]);
    expect(result.map((row) => row.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("preserves non-reordered items in their original positions", () => {
    const result = reorderInPlace(rows, ["d", "b"]);
    expect(result.map((row) => row.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("ignores ids that aren't present in items", () => {
    const result = reorderInPlace(rows, ["zzz", "a", "c"]);
    expect(result.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("works with a single-item reorder (no-op)", () => {
    const result = reorderInPlace(rows, ["b"]);
    expect(result.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles reordering every item", () => {
    const result = reorderInPlace(rows, ["d", "c", "b", "a"]);
    expect(result.map((row) => row.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("returns identity-stable references for non-reordered items", () => {
    const result = reorderInPlace(rows, ["c", "a"]);
    expect(result[1]).toBe(rows[1]);
    expect(result[3]).toBe(rows[3]);
  });

  it("returns the same array shape when orderedIds is empty", () => {
    const result = reorderInPlace(rows, []);
    expect(result.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });
});
