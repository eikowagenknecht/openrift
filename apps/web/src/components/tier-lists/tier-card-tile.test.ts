import { describe, expect, it } from "vitest";

import { TIER_TILE_WIDTHS } from "@/stores/display-store";

import { tierRowMinHeight } from "./tier-card-tile";

/** A portrait card is 63×88mm, so a tile is this much taller than it is wide. */
const ASPECT = 88 / 63;

describe("tierRowMinHeight", () => {
  it("leaves room for a tile plus the row's own padding", () => {
    // The whole point of the helper: a row that already fits a tile does not
    // grow when the first card lands in it.
    for (const width of TIER_TILE_WIDTHS) {
      expect(tierRowMinHeight(width)).toBeGreaterThanOrEqual(width * ASPECT + 8);
    }
  });

  it("stays tight — never more than a pixel of slack over the tile", () => {
    for (const width of TIER_TILE_WIDTHS) {
      expect(tierRowMinHeight(width)).toBeLessThan(width * ASPECT + 9);
    }
  });

  it("grows with the tile", () => {
    expect(tierRowMinHeight(112)).toBeGreaterThan(tierRowMinHeight(40));
  });

  it("returns whole pixels", () => {
    expect(tierRowMinHeight(56) % 1).toBe(0);
  });
});
