import { describe, expect, it } from "vitest";

import { seededShuffle } from "./seeded-shuffle";

describe("seededShuffle", () => {
  it("returns an empty array for empty input", () => {
    expect(seededShuffle([], 123)).toEqual([]);
  });

  it("returns a single-element array unchanged", () => {
    expect(seededShuffle(["only"], 7)).toEqual(["only"]);
  });

  it("is deterministic for the same seed and input", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it("produces different orderings for different seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 999));
  });

  it("preserves the multiset of elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(seededShuffle(items, 5).toSorted()).toEqual([...items].toSorted());
  });

  it("does not mutate the input", () => {
    const items = [1, 2, 3];
    const copy = [...items];
    seededShuffle(items, 3);
    expect(items).toEqual(copy);
  });
});
