import { describe, expect, it } from "vitest";

import { TIER_TILE_WIDTHS } from "@/stores/display-store";

import { tierRowMinHeight } from "./tier-card-tile";

/** A portrait card is 63×88mm, so a tile is this much taller than it is wide. */
const ASPECT = 88 / 63;

describe("tierRowMinHeight", () => {
  it("is exactly a tile plus the row's own padding, at every size", () => {
    // The whole point of the helper: an empty row is the same height as a full
    // one, so the ladder does not twitch as cards land. Exact rather than
    // rounded — a pixel of slack was visible as the row settling.
    for (const width of TIER_TILE_WIDTHS) {
      expect(tierRowMinHeight(width)).toBe(width * ASPECT + 8);
    }
  });

  it("grows with the tile", () => {
    expect(tierRowMinHeight(112)).toBeGreaterThan(tierRowMinHeight(40));
  });
});
