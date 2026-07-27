import { describe, expect, it } from "vitest";

import { fitCardRects } from "./fit-rect";
import { boundingBox } from "./geometry";
import type { GrayImage } from "./types";

/**
 * Build a uniform grayscale frame.
 *
 * @returns The frame.
 */
function frame(width: number, height: number, fill: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(fill), width, height };
}

describe("fitCardRects", () => {
  it("returns nothing for a featureless frame", () => {
    expect(fitCardRects(frame(160, 200, 128))).toEqual([]);
  });

  it("finds a centred card-proportioned rectangle", () => {
    // A bright card on a dark table, sized to one of the searched scales:
    // long side 0.72 of the 200px short side is 144, and 144 * 63/88 is 103.
    const image = frame(200, 260, 30);
    const left = 48;
    const top = 58;
    for (let y = top; y < top + 144; y++) {
      for (let x = left; x < left + 103; x++) {
        image.data[y * image.width + x] = 220;
      }
    }

    const candidates = fitCardRects(image);
    expect(candidates.length).toBeGreaterThan(0);
    const box = boundingBox(candidates[0].quad);
    expect(Math.abs(box.minX - left)).toBeLessThanOrEqual(10);
    expect(Math.abs(box.maxX - (left + 103))).toBeLessThanOrEqual(10);
    expect(Math.abs(box.minY - top)).toBeLessThanOrEqual(10);
    expect(Math.abs(box.maxY - (top + 144))).toBeLessThanOrEqual(10);
  });
});
