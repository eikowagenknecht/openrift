import { describe, expect, it } from "vitest";

import { applyMulligan, shuffle } from "./deck-mulligan";

const card = (key: string) => ({ key });
const identity = <Value>(items: readonly Value[]): Value[] => [...items];

describe("applyMulligan", () => {
  const hand = [card("a"), card("b"), card("c"), card("d")];
  const library = [card("e"), card("f"), card("g")];

  it("replaces the selected cards from the top of the library", () => {
    const result = applyMulligan(hand, library, new Set(["b", "d"]), identity);
    expect(result.hand.map((entry) => entry.key)).toEqual(["a", "c", "e", "f"]);
  });

  it("recycles the exchanged cards to the bottom of the library", () => {
    const result = applyMulligan(hand, library, new Set(["b", "d"]), identity);
    expect(result.library.map((entry) => entry.key)).toEqual(["g", "b", "d"]);
  });

  it("keeps the total card count unchanged", () => {
    const result = applyMulligan(hand, library, new Set(["a"]), identity);
    expect(result.hand).toHaveLength(hand.length);
    expect(result.library).toHaveLength(library.length);
  });

  it("returns hand and library unchanged for an empty selection", () => {
    const result = applyMulligan(hand, library, new Set(), identity);
    expect(result.hand.map((entry) => entry.key)).toEqual(["a", "b", "c", "d"]);
    expect(result.library.map((entry) => entry.key)).toEqual(["e", "f", "g"]);
  });

  it("draws only what the library holds when it runs short", () => {
    const result = applyMulligan(hand, [card("e")], new Set(["a", "b"]), identity);
    expect(result.hand.map((entry) => entry.key)).toEqual(["c", "d", "e"]);
    expect(result.library.map((entry) => entry.key)).toEqual(["a", "b"]);
  });
});

describe("shuffle", () => {
  it("returns a fresh array with the same members", () => {
    const input = [card("a"), card("b"), card("c"), card("d"), card("e")];
    const result = shuffle(input);
    expect(result).not.toBe(input);
    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((entry) => entry.key))).toEqual(
      new Set(input.map((entry) => entry.key)),
    );
    expect(input.map((entry) => entry.key)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([1])).toEqual([1]);
  });
});
