import { describe, expect, it, vi } from "vitest";

import { groupByShim } from "./polyfills";

// The test runtime already has a native Map.groupBy, making the install
// branch inert here; these exercise the shim directly.
describe("groupByShim", () => {
  it("groups items by the selector key", () => {
    const cards = [
      { name: "a", set: "OGN" },
      { name: "b", set: "UNL" },
      { name: "c", set: "OGN" },
    ];

    const grouped = groupByShim(cards, (card) => card.set);

    expect([...grouped.keys()]).toEqual(["OGN", "UNL"]);
    expect(grouped.get("OGN")).toEqual([cards[0], cards[2]]);
    expect(grouped.get("UNL")).toEqual([cards[1]]);
  });

  it("matches the native implementation", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const parity = (n: number) => (n % 2 === 0 ? "even" : "odd");

    expect(groupByShim(items, parity)).toEqual(Map.groupBy(items, parity));
  });

  it("passes the index to the selector", () => {
    const seen: number[] = [];

    groupByShim(["a", "b", "c"], (_item, index) => {
      seen.push(index);
      return index < 2 ? "head" : "tail";
    });

    expect(seen).toEqual([0, 1, 2]);
  });

  it("returns an empty map for empty input", () => {
    expect(groupByShim([], (item) => item)).toEqual(new Map());
  });

  it("accepts any iterable, not just arrays", () => {
    const grouped = groupByShim(new Set(["aa", "b", "cc"]), (word) => word.length);

    expect(grouped.get(2)).toEqual(["aa", "cc"]);
    expect(grouped.get(1)).toEqual(["b"]);
  });

  it("keeps distinct keys that are not equal by identity", () => {
    const keyA = { id: 1 };
    const keyB = { id: 1 };

    const grouped = groupByShim([keyA, keyB], (item) => item);

    expect(grouped.size).toBe(2);
  });
});

// Simulates an engine without the built-in (iOS Safari < 17.4) to exercise
// the install branch.
describe("Map.groupBy install", () => {
  it("installs the shim when the built-in is missing", async () => {
    const native = Map.groupBy;
    // oxlint-disable-next-line typescript/no-explicit-any -- simulating an engine that predates the built-in
    delete (Map as any).groupBy;

    try {
      vi.resetModules();
      await import("./polyfills");

      expect(typeof Map.groupBy).toBe("function");
      expect(Map.groupBy([1, 2, 3, 4], (n) => n % 2)).toEqual(
        new Map([
          [1, [1, 3]],
          [0, [2, 4]],
        ]),
      );
    } finally {
      Map.groupBy = native;
    }
  });

  it("leaves a native implementation untouched", async () => {
    const native = Map.groupBy;

    vi.resetModules();
    await import("./polyfills");

    expect(Map.groupBy).toBe(native);
  });
});
