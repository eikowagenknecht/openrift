import { describe, expect, it } from "vitest";

import type { Random } from "./rng";
import { mathRandom, mulberry32, pickOneUnique } from "./rng";

function draw(rng: Random, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

function fixed(...values: number[]): Random {
  let index = 0;
  return {
    next: () => values[index++ % values.length] ?? 0,
  };
}

describe("mulberry32", () => {
  it("replays the same sequence for the same seed", () => {
    expect(draw(mulberry32(1234), 20)).toEqual(draw(mulberry32(1234), 20));
  });

  it("produces a different sequence for a different seed", () => {
    expect(draw(mulberry32(1234), 20)).not.toEqual(draw(mulberry32(1235), 20));
  });

  it("advances on every call rather than repeating one value", () => {
    const values = draw(mulberry32(7), 10);
    expect(new Set(values).size).toBe(10);
  });

  it("stays within [0, 1)", () => {
    for (const value of draw(mulberry32(99), 5000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("normalises a negative seed onto its unsigned counterpart", () => {
    expect(draw(mulberry32(-1), 5)).toEqual(draw(mulberry32(2 ** 32 - 1), 5));
  });

  it("wraps a seed past the 32-bit range", () => {
    expect(draw(mulberry32(2 ** 32 + 3), 5)).toEqual(draw(mulberry32(3), 5));
  });

  it("spreads draws roughly evenly over ten buckets", () => {
    const buckets = Array.from({ length: 10 }, () => 0);
    const total = 50_000;
    for (const value of draw(mulberry32(2026), total)) {
      const bucket = Math.floor(value * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(total * 0.085);
      expect(count).toBeLessThan(total * 0.115);
    }
  });

  it("has a mean near one half", () => {
    const values = draw(mulberry32(31), 50_000);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

describe("mathRandom", () => {
  it("returns floats within [0, 1)", () => {
    for (const value of draw(mathRandom, 200)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pickOneUnique", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("indexes the eligible items by the drawn fraction", () => {
    expect(pickOneUnique(fixed(0), items, new Set()).id).toBe("a");
    expect(pickOneUnique(fixed(0.5), items, new Set()).id).toBe("b");
    expect(pickOneUnique(fixed(0.99), items, new Set()).id).toBe("c");
  });

  it("skips excluded ids", () => {
    expect(pickOneUnique(fixed(0), items, new Set(["a"])).id).toBe("b");
    expect(pickOneUnique(fixed(0.99), items, new Set(["c"])).id).toBe("b");
  });

  it("falls back to the full list when everything is excluded", () => {
    expect(pickOneUnique(fixed(0), items, new Set(["a", "b", "c"])).id).toBe("a");
  });

  it("only ever returns items from the given list", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(pickOneUnique(rng, items, new Set(["b"])));
    }
  });

  it("never returns an excluded item while an eligible one remains", () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      expect(pickOneUnique(rng, items, new Set(["b"])).id).not.toBe("b");
    }
  });

  it("throws on an empty list", () => {
    const empty: { id: string }[] = [];
    expect(() => pickOneUnique(fixed(0), empty, new Set())).toThrow("empty array");
  });
});
