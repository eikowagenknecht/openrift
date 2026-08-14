import { describe, expect, it } from "vitest";

import { TIER_COLORS, tierColor } from "./tier-colors.js";

describe("tierColor", () => {
  it("gives each of the twelve board positions its own colour", () => {
    const colors = TIER_COLORS.map((_unused, index) => tierColor(index));
    expect(new Set(colors).size).toBe(TIER_COLORS.length);
  });

  it("wraps past the palette's end instead of failing", () => {
    expect(tierColor(TIER_COLORS.length)).toBe(TIER_COLORS[0]);
    expect(tierColor(TIER_COLORS.length + 3)).toBe(TIER_COLORS[3]);
  });
});
