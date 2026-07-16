import { describe, expect, it } from "vitest";

import { assignTableNumbers } from "./table-assignment";
import type { Pod } from "./types";

function match(...ids: string[]): Pod {
  return { size: 2, playerIds: ids };
}

function fourPod(...ids: string[]): Pod {
  return { size: 4, playerIds: ids };
}

describe("assignTableNumbers", () => {
  it("numbers pods 1..N in order when nobody has a fixed table", () => {
    const pods = [match("a", "b"), match("c", "d"), match("e", "f")];
    expect(assignTableNumbers(pods, new Map())).toEqual([1, 2, 3]);
  });

  it("returns an empty assignment for an all-bye round", () => {
    expect(assignTableNumbers([], new Map([["a", 3]]))).toEqual([]);
  });

  it("gives a fixed-seat player's pod their table and fills the rest around it", () => {
    const pods = [match("a", "b"), match("c", "d"), match("e", "f")];
    expect(assignTableNumbers(pods, new Map([["c", 1]]))).toEqual([2, 1, 3]);
  });

  it("leaves a gap for a fixed table beyond the pod count", () => {
    const pods = [match("a", "b"), match("c", "d")];
    expect(assignTableNumbers(pods, new Map([["a", 7]]))).toEqual([7, 1]);
  });

  it("lets two fixed-seat players meet: the lower table wins", () => {
    const pods = [match("a", "b"), match("c", "d")];
    const fixed = new Map([
      ["a", 7],
      ["b", 3],
    ]);
    expect(assignTableNumbers(pods, fixed)).toEqual([3, 1]);
  });

  it("resolves the same fixed table on two pods by pod order, displacing the later one", () => {
    const pods = [match("a", "b"), match("c", "d"), match("e", "f")];
    const fixed = new Map([
      ["a", 2],
      ["c", 2],
    ]);
    // Pod 0 claims table 2; pod 1 has no free fixed table left and fills like
    // an unfixed pod, keeping its relative order among the fillers.
    expect(assignTableNumbers(pods, fixed)).toEqual([2, 1, 3]);
  });

  it("honors fixed seats in bigger pods too", () => {
    const pods = [fourPod("a", "b", "c", "d"), fourPod("e", "f", "g", "h")];
    const fixed = new Map([
      ["f", 5],
      ["h", 2],
    ]);
    // Within one pod the lowest fixed table wins.
    expect(assignTableNumbers(pods, fixed)).toEqual([1, 2]);
  });

  it("never assigns a table twice even with many overlapping fixed seats", () => {
    const pods = [match("a", "b"), match("c", "d"), match("e", "f"), match("g", "h")];
    const fixed = new Map([
      ["a", 2],
      ["c", 2],
      ["e", 2],
      ["g", 3],
    ]);
    const numbers = assignTableNumbers(pods, fixed);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual([2, 1, 4, 3]);
  });
});
