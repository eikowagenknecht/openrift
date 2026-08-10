import { describe, expect, it } from "vitest";

import { moveToIndex } from "./move-to-index";

const ITEMS = ["a", "b", "c", "d"];

describe("moveToIndex", () => {
  it("moves an entry later, shifting the ones it passes", () => {
    expect(moveToIndex(ITEMS, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an entry earlier", () => {
    expect(moveToIndex(ITEMS, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves by one, matching what an up/down button does", () => {
    expect(moveToIndex(ITEMS, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(moveToIndex(ITEMS, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });

  it("moves to the end", () => {
    expect(moveToIndex(ITEMS, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("returns null when the source and target match", () => {
    expect(moveToIndex(ITEMS, 2, 2)).toBeNull();
  });

  it("returns null for an out-of-range index", () => {
    expect(moveToIndex(ITEMS, -1, 1)).toBeNull();
    expect(moveToIndex(ITEMS, 1, -1)).toBeNull();
    expect(moveToIndex(ITEMS, 4, 1)).toBeNull();
    expect(moveToIndex(ITEMS, 1, 4)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(moveToIndex([], 0, 0)).toBeNull();
  });

  it("returns null for a single-entry list", () => {
    expect(moveToIndex(["only"], 0, 0)).toBeNull();
  });

  it("does not mutate the input", () => {
    const original = [...ITEMS];
    moveToIndex(original, 0, 3);
    expect(original).toEqual(ITEMS);
  });

  it("handles a two-entry swap in both directions", () => {
    expect(moveToIndex(["x", "y"], 0, 1)).toEqual(["y", "x"]);
    expect(moveToIndex(["x", "y"], 1, 0)).toEqual(["y", "x"]);
  });
});
