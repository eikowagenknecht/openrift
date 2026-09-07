/**
 * Pure pixel-math tests: no `Io`, no sharp, no filesystem doubles. The
 * synthetic scan builder is local because it is the only input these
 * functions take.
 */
import { describe, expect, it } from "vitest";

import { computeScanCropBox, computeScanLevels } from "./scan-analysis.js";

/**
 * Build a synthetic greyscale scan: white background with an optional darker
 * rectangle (the "card") of the given luminance value.
 */
function greyScan(
  width: number,
  height: number,
  card?: { left: number; top: number; width: number; height: number },
  value = 30,
): Buffer {
  const buf = Buffer.alloc(width * height, 255);
  if (card) {
    for (let y = card.top; y < card.top + card.height; y++) {
      for (let x = card.left; x < card.left + card.width; x++) {
        buf[y * width + x] = value;
      }
    }
  }
  return buf;
}

describe("computeScanCropBox", () => {
  it("finds the card's bounding box in a white scan", () => {
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("ignores isolated dust specks outside the card", () => {
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    grey[150 * 200 + 5] = 0;
    grey[295 * 200 + 90] = 0;
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("returns the full frame for an edge-to-edge card", () => {
    const grey = greyScan(200, 300, { left: 0, top: 0, width: 200, height: 300 });
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 0,
      top: 0,
      width: 200,
      height: 300,
    });
  });

  it("returns null for a blank scan", () => {
    expect(computeScanCropBox(greyScan(200, 300), 200, 300)).toBeNull();
  });

  it("returns null when the buffer doesn't match the dimensions", () => {
    expect(computeScanCropBox(Buffer.from("tiny"), 200, 300)).toBeNull();
  });

  it("tightens away the shallow wedge a slightly tilted card leaves", () => {
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    for (let y = 230; y < 234; y++) {
      for (let x = 90; x < 140; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("caps edge tightening so bright-edged art only loses a sliver", () => {
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    for (let y = 230; y < 260; y++) {
      for (let x = 40; x < 80; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 226,
    });
  });
});

describe("computeScanLevels", () => {
  const fullBox = { left: 0, top: 0, width: 200, height: 300 };

  it("stretches a lifted black point back to 0", () => {
    const grey = greyScan(200, 300, fullBox, 30);
    const multiply = 255 / (220 - 30);
    expect(computeScanLevels(grey, 200, fullBox)).toEqual({
      multiply,
      offset: -30 * multiply,
    });
  });

  it("caps the black point so dark art is not over-stretched", () => {
    const grey = greyScan(200, 300, fullBox, 90);
    const multiply = 255 / (220 - 40);
    expect(computeScanLevels(grey, 200, fullBox)).toEqual({
      multiply,
      offset: -40 * multiply,
    });
  });

  it("returns null when the scan already spans full range", () => {
    const grey = greyScan(200, 300, fullBox, 0);
    grey.fill(255, 0, 200 * 150);
    expect(computeScanLevels(grey, 200, fullBox)).toBeNull();
  });

  it("measures only inside the box", () => {
    const grey = Buffer.alloc(200 * 300, 0);
    const box = { left: 50, top: 50, width: 100, height: 100 };
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    const multiply = 255 / (220 - 30);
    expect(computeScanLevels(grey, 200, box)).toEqual({
      multiply,
      offset: -30 * multiply,
    });
  });

  it("returns null for a degenerate box", () => {
    const grey = greyScan(200, 300);
    expect(computeScanLevels(grey, 200, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});
