import { describe, expect, it } from "vitest";

import { clamp } from "./math";

describe("clamp", () => {
  it("leaves a value already inside the range alone", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("pulls a value below the range up to the minimum", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("pulls a value above the range down to the maximum", () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("keeps the bounds themselves", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("collapses an inverted range to the maximum", () => {
    expect(clamp(5, 10, 0)).toBe(0);
  });
});
