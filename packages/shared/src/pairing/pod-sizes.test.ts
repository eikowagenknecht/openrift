import { describe, expect, it } from "vitest";

import { determinePodSizes, suggestedRoundCount } from "./pod-sizes";

describe("determinePodSizes", () => {
  it("matches every worked example from the spec", () => {
    const cases: Record<number, { fours: number; threes: number }> = {
      3: { fours: 0, threes: 1 },
      4: { fours: 1, threes: 0 },
      6: { fours: 0, threes: 2 },
      7: { fours: 1, threes: 1 },
      8: { fours: 2, threes: 0 },
      9: { fours: 0, threes: 3 },
      10: { fours: 1, threes: 2 },
      11: { fours: 2, threes: 1 },
      12: { fours: 3, threes: 0 },
      13: { fours: 1, threes: 3 },
      14: { fours: 2, threes: 2 },
      15: { fours: 3, threes: 1 },
      16: { fours: 4, threes: 0 },
    };
    for (const [count, expected] of Object.entries(cases)) {
      expect(determinePodSizes(Number(count))).toEqual(expected);
    }
  });

  it("returns null for the unrepresentable counts 1, 2, and 5", () => {
    expect(determinePodSizes(1)).toBeNull();
    expect(determinePodSizes(2)).toBeNull();
    expect(determinePodSizes(5)).toBeNull();
  });

  it("returns null for non-positive or non-integer counts", () => {
    expect(determinePodSizes(0)).toBeNull();
    expect(determinePodSizes(-3)).toBeNull();
    expect(determinePodSizes(7.5)).toBeNull();
  });

  it("maximizes fours then minimizes threes, and always sums back to the count", () => {
    for (let count = 3; count <= 64; count++) {
      const sizes = determinePodSizes(count);
      if (count === 5) {
        expect(sizes).toBeNull();
        continue;
      }
      expect(sizes).not.toBeNull();
      const { fours, threes } = sizes!;
      expect(fours * 4 + threes * 3).toBe(count);
      // Minimal threes: you can never trade 4 threes for 3 fours (both = 12),
      // so the chosen `threes` is in 0..3 except where forced higher is impossible.
      expect(threes).toBeLessThanOrEqual(3);
    }
  });
});

describe("suggestedRoundCount", () => {
  it("returns ceil(log2(playerCount)) for a real field", () => {
    const cases: Record<number, number> = {
      2: 1,
      3: 2,
      4: 2,
      5: 3,
      8: 3,
      9: 4,
      16: 4,
      17: 5,
      32: 5,
    };
    for (const [count, expected] of Object.entries(cases)) {
      expect(suggestedRoundCount(Number(count))).toBe(expected);
    }
  });

  it("returns 0 for fewer than two players", () => {
    expect(suggestedRoundCount(0)).toBe(0);
    expect(suggestedRoundCount(1)).toBe(0);
  });
});
