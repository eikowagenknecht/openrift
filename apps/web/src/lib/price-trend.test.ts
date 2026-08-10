import { describe, expect, it } from "vitest";

import { percentChange } from "./price-trend";

describe("percentChange", () => {
  it("reports a rise between the first and last value", () => {
    expect(percentChange([2, 2.5, 3])).toBe(50);
  });

  it("reports a fall as a negative percentage", () => {
    expect(percentChange([4, 3, 2])).toBe(-50);
  });

  it("ignores the path between the ends", () => {
    expect(percentChange([2, 100, 0.5, 3])).toBe(50);
  });

  it("rounds to whole percent", () => {
    expect(percentChange([3, 4])).toBe(33);
  });

  it("returns zero for a flat series", () => {
    expect(percentChange([5, 5])).toBe(0);
  });

  it("returns zero when there is nothing to compare", () => {
    expect(percentChange([])).toBe(0);
    expect(percentChange([5])).toBe(0);
  });

  // A free first snapshot would make every later price an infinite rise.
  it("returns zero when the series starts at zero", () => {
    expect(percentChange([0, 5])).toBe(0);
  });
});
