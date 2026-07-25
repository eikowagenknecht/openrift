import { describe, expect, it } from "vitest";

import { fitImageOnPage } from "./image-pdf";

describe("fitImageOnPage", () => {
  it("turns the page landscape for a wide image (the deck share image)", () => {
    const placement = fitImageOnPage(3600, 1890);
    expect(placement.orientation).toBe("landscape");
    expect(placement.pageWidth).toBe(297);
    expect(placement.pageHeight).toBe(210);
  });

  it("keeps the page portrait for a tall or square image", () => {
    expect(fitImageOnPage(1890, 3600).orientation).toBe("portrait");
    expect(fitImageOnPage(1000, 1000).orientation).toBe("portrait");
  });

  it("preserves the aspect ratio", () => {
    const placement = fitImageOnPage(1200, 630);
    expect(placement.width / placement.height).toBeCloseTo(1200 / 630);
  });

  it("centres the image inside the margins", () => {
    const placement = fitImageOnPage(1200, 630, 8);
    expect(placement.x * 2 + placement.width).toBeCloseTo(placement.pageWidth);
    expect(placement.y * 2 + placement.height).toBeCloseTo(placement.pageHeight);
    expect(placement.x).toBeGreaterThanOrEqual(8);
    expect(placement.y).toBeGreaterThanOrEqual(8);
  });

  it("fits within the printable area on both axes", () => {
    for (const [width, height] of [
      [3600, 1890],
      [1000, 1000],
      [600, 2000],
    ]) {
      const placement = fitImageOnPage(width, height, 8);
      expect(placement.width).toBeLessThanOrEqual(placement.pageWidth - 16 + 0.001);
      expect(placement.height).toBeLessThanOrEqual(placement.pageHeight - 16 + 0.001);
    }
  });
});
