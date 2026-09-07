import { describe, expect, it } from "vitest";

import { nextOversize, oversizeCount, oversizeState } from "./oversize-filter";

describe("oversizeState", () => {
  it("returns null for an empty (unconstrained) selection", () => {
    expect(oversizeState([])).toBe(null);
  });

  it("returns true when only oversized is selected", () => {
    expect(oversizeState(["oversized"])).toBe(true);
  });

  it("returns false when a non-oversized size is selected", () => {
    expect(oversizeState(["standard"])).toBe(false);
  });

  it("returns null for an ambiguous selection that still includes oversized", () => {
    expect(oversizeState(["oversized", "standard"])).toBe(null);
  });
});

describe("nextOversize", () => {
  it("cycles null → oversized → standard → off", () => {
    const off = nextOversize([]);
    expect(off).toEqual(["oversized"]);

    const oversized = nextOversize(off);
    expect(oversized).toEqual(["standard"]);

    expect(nextOversize(oversized)).toEqual([]);
  });
});

describe("oversizeCount", () => {
  const counts = new Map([
    ["oversized", 12],
    ["standard", 340],
  ]);

  it("shows the oversized count when off or requiring oversized", () => {
    expect(oversizeCount(counts, null)).toBe(12);
    expect(oversizeCount(counts, true)).toBe(12);
  });

  it("shows the standard count when forbidding oversized", () => {
    expect(oversizeCount(counts, false)).toBe(340);
  });

  it("returns undefined when counts are not loaded", () => {
    expect(oversizeCount(undefined, true)).toBe(undefined);
  });
});
