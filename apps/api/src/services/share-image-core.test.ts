import { describe, expect, it } from "vitest";

import { CARD_RADIUS_FRACTION, baselineNudge, cardRadiusPx } from "./share-image-core.js";

describe("baselineNudge", () => {
  // Offsets are measured off rendered PNGs at `lineHeight: 1`, the value every caller pins.
  it("matches the measured offset for the title / byline pairing", () => {
    expect(baselineNudge(34, 22)).toBe(-2);
  });

  it("matches the measured offset for the title / metadata pairing", () => {
    expect(baselineNudge(34, 20)).toBe(-2);
  });

  it("matches the measured offset for the overflow tile's pairing", () => {
    expect(baselineNudge(34, 21)).toBe(-2);
  });

  it("scales with the gap, not with either size on its own", () => {
    expect(baselineNudge(200, 20)).toBe(-25);
    expect(baselineNudge(100, 20)).toBe(-11);
    expect(baselineNudge(40, 20)).toBe(-3);
  });

  it("leaves equally-sized runs alone, since their boxes already agree", () => {
    expect(baselineNudge(26, 26)).toBe(0);
  });

  it("never pushes the smaller run down", () => {
    for (let size = 8; size <= 60; size++) {
      expect(baselineNudge(size, size)).toBe(0);
      expect(baselineNudge(size + 10, size)).toBeLessThan(0);
    }
  });
});

describe("cardRadiusPx", () => {
  it("rounds to 5% of the tile's short edge", () => {
    expect(cardRadiusPx(100, 140)).toBe(5);
    expect(cardRadiusPx(200, 280)).toBe(10);
  });

  it("uses the short edge for landscape (battlefield) tiles", () => {
    expect(cardRadiusPx(280, 200)).toBe(10);
    expect(cardRadiusPx(140, 100)).toBe(5);
  });

  it("matches the exported fraction", () => {
    expect(cardRadiusPx(1000, 1000)).toBe(Math.round(1000 * CARD_RADIUS_FRACTION));
  });

  it("rounds to the nearest whole pixel", () => {
    expect(cardRadiusPx(63, 88)).toBe(3);
  });
});
