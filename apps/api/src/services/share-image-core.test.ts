import { describe, expect, it } from "vitest";

import { CARD_RADIUS_FRACTION, cardRadiusPx } from "./share-image-core.js";

describe("cardRadiusPx", () => {
  it("rounds to 5% of the tile's short edge", () => {
    // Portrait tile: width is the short edge, so 5% of it.
    expect(cardRadiusPx(100, 140)).toBe(5);
    expect(cardRadiusPx(200, 280)).toBe(10);
  });

  it("uses the short edge for landscape (battlefield) tiles", () => {
    // Landscape tile: height is now the short edge, so the radius tracks it, not
    // the wider width — keeping the corner physically proportional to the art.
    expect(cardRadiusPx(280, 200)).toBe(10);
    expect(cardRadiusPx(140, 100)).toBe(5);
  });

  it("matches the exported fraction", () => {
    expect(cardRadiusPx(1000, 1000)).toBe(Math.round(1000 * CARD_RADIUS_FRACTION));
  });

  it("rounds to the nearest whole pixel", () => {
    // 63 × 0.05 = 3.15 → 3.
    expect(cardRadiusPx(63, 88)).toBe(3);
  });
});
