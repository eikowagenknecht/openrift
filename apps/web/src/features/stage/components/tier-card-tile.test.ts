import { describe, expect, it } from "vitest";

import { TIER_TILE_WIDTHS } from "@/stores/display-store";

import { tierRowMinHeight } from "./tier-card-tile";

const ASPECT = 88 / 63;

describe("tierRowMinHeight", () => {
  it("is exactly a tile plus the row's own padding, not rounded, at every size", () => {
    for (const width of TIER_TILE_WIDTHS) {
      expect(tierRowMinHeight(width)).toBe(width * ASPECT + 8);
    }
  });

  it("grows with the tile", () => {
    expect(tierRowMinHeight(112)).toBeGreaterThan(tierRowMinHeight(40));
  });
});
