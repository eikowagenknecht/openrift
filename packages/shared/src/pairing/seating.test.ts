import { describe, expect, it } from "vitest";

import { mulberry32 } from "../pack-opener/rng";
import { adjacentKey, arrangeSeating, foldSeatingHistory } from "./seating";
import type { SeatingHistory } from "./seating";

function podRows(
  podId: string,
  seated: string[],
): { podId: string; playerId: string; seat: number | null }[] {
  return seated.map((playerId, seat) => ({ podId, playerId, seat }));
}

function neighborPairs(seated: string[]): string[] {
  return seated.map((playerId, index) =>
    adjacentKey(playerId, seated[(index + 1) % seated.length]),
  );
}

describe("foldSeatingHistory", () => {
  it("counts circular neighbor pairs per finalized pod", () => {
    const history = foldSeatingHistory(podRows("pod-1", ["a", "b", "c", "d"]));
    expect(history.adjacent.get(adjacentKey("a", "b"))).toBe(1);
    expect(history.adjacent.get(adjacentKey("d", "a"))).toBe(1);
    // Across the table is not a neighbor.
    expect(history.adjacent.get(adjacentKey("a", "c"))).toBeUndefined();
    expect(history.succession.get("a>b")).toBe(1);
    expect(history.succession.get("b>a")).toBeUndefined();
  });

  it("accumulates counts across pods and rounds", () => {
    const history = foldSeatingHistory([
      ...podRows("pod-1", ["a", "b", "c", "d"]),
      ...podRows("pod-2", ["a", "b", "d", "c"]),
    ]);
    expect(history.adjacent.get(adjacentKey("a", "b"))).toBe(2);
  });

  it("skips pods without stored seats and 1v1 matches", () => {
    const legacy = [
      { podId: "pod-1", playerId: "a", seat: null },
      { podId: "pod-1", playerId: "b", seat: null },
      { podId: "pod-1", playerId: "c", seat: null },
    ];
    expect(foldSeatingHistory(legacy).adjacent.size).toBe(0);
    expect(foldSeatingHistory(podRows("pod-2", ["a", "b"])).adjacent.size).toBe(0);
  });
});

describe("arrangeSeating", () => {
  it("seats every player exactly once, anchored on the first", () => {
    const history = foldSeatingHistory([]);
    const seated = arrangeSeating(["a", "b", "c", "d"], history, mulberry32(1));
    expect(seated[0]).toBe("a");
    expect(seated.toSorted()).toEqual(["a", "b", "c", "d"]);
  });

  it("returns 1v1 matches unchanged", () => {
    const history = foldSeatingHistory([]);
    expect(arrangeSeating(["a", "b"], history, mulberry32(1))).toEqual(["a", "b"]);
  });

  it("breaks up last round's neighbor structure in a 4-pod", () => {
    const previous = ["a", "b", "c", "d"];
    const history = foldSeatingHistory(podRows("pod-1", previous));
    const seated = arrangeSeating(previous, history, mulberry32(7));
    const repeats = neighborPairs(seated).filter((pair) =>
      neighborPairs(previous).includes(pair),
    ).length;
    expect(repeats).toBe(2);
  });

  it("reverses a 3-pod's turn order, where neighbors cannot change", () => {
    const history = foldSeatingHistory(podRows("pod-1", ["a", "b", "c"]));
    // All three are neighbors either way; only the succession can be fresh.
    expect(arrangeSeating(["a", "b", "c"], history, mulberry32(1))).toEqual(["a", "c", "b"]);
  });

  it("prefers fewer repeated neighbors over fresh succession", () => {
    // b|c have sat together twice, a|b once: the arrangement must split b and c
    // even when a succession-only alternative exists.
    const history: SeatingHistory = {
      adjacent: new Map([
        [adjacentKey("b", "c"), 2],
        [adjacentKey("a", "b"), 1],
      ]),
      succession: new Map([["a>d", 5]]),
    };
    const seated = arrangeSeating(["a", "b", "c", "d"], history, mulberry32(1));
    expect(neighborPairs(seated)).not.toContain(adjacentKey("b", "c"));
  });

  it("is deterministic under a seeded rng when arrangements tie", () => {
    const history = foldSeatingHistory([]);
    const first = arrangeSeating(["a", "b", "c", "d"], history, mulberry32(42));
    const second = arrangeSeating(["a", "b", "c", "d"], history, mulberry32(42));
    expect(first).toEqual(second);
  });
});
