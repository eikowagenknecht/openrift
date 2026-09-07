import { describe, expect, it } from "vitest";

import { fitCardRects } from "./fit-rect";
import { boundingBox } from "./geometry";
import type { GrayImage } from "./types";

function frame(width: number, height: number, fill: number): GrayImage {
  return { data: new Uint8Array(width * height).fill(fill), width, height };
}

describe("fitCardRects", () => {
  it("returns nothing for a featureless frame", () => {
    expect(fitCardRects(frame(160, 200, 128))).toEqual([]);
  });

  it("finds a centred card-proportioned rectangle", () => {
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
