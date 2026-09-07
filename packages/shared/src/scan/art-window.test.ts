import { describe, expect, it } from "vitest";

import { ART_LANDSCAPE, ART_PORTRAIT, artWindowRect } from "./art-window";

describe("artWindowRect", () => {
  it("uses the portrait window when the image is taller than wide", () => {
    expect(artWindowRect(100, 200)).toEqual({ x: 7, y: 10, width: 86, height: 90 });
  });

  it("uses the landscape window when the image is wider than tall", () => {
    expect(artWindowRect(200, 100)).toEqual({ x: 8, y: 20, width: 184, height: 38 });
  });

  it("treats a square image as landscape", () => {
    expect(artWindowRect(100, 100)).toEqual({ x: 4, y: 20, width: 92, height: 38 });
  });

  it("keeps the rect inside the image for both orientations", () => {
    for (const [width, height] of [
      [63, 88],
      [88, 63],
      [745, 1040],
      [17, 23],
    ] as const) {
      const rect = artWindowRect(width, height);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
  });

  it("scales linearly with the image size", () => {
    const small = artWindowRect(200, 400);
    const large = artWindowRect(400, 800);
    expect(large).toEqual({
      x: small.x * 2,
      y: small.y * 2,
      width: small.width * 2,
      height: small.height * 2,
    });
  });

  it("keeps the portrait window narrower and higher up than the landscape one", () => {
    expect(ART_PORTRAIT.x0).toBeGreaterThan(ART_LANDSCAPE.x0);
    expect(ART_PORTRAIT.y0).toBeLessThan(ART_LANDSCAPE.y0);
  });
});
