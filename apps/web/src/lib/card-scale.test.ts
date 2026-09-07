import { describe, expect, it } from "vitest";

import { clampCardScale, MAX_CARD_SCALE, MIN_CARD_SCALE } from "./card-scale";

describe("clampCardScale", () => {
  it("passes a scale already in range through untouched", () => {
    expect(clampCardScale(0.75)).toBe(0.75);
  });

  it("clamps at both ends", () => {
    expect(clampCardScale(-1)).toBe(MIN_CARD_SCALE);
    expect(clampCardScale(2)).toBe(MAX_CARD_SCALE);
  });

  it("falls back to full size for a value that isn't a number", () => {
    expect(clampCardScale(Number.NaN)).toBe(MAX_CARD_SCALE);
    expect(clampCardScale(Number.POSITIVE_INFINITY)).toBe(MAX_CARD_SCALE);
  });
});
