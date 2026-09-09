import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import type { CardCandidate, Quad } from "@openrift/shared/scan/types";
import { describe, expect, it } from "vitest";

import {
  bestCandidateQuad,
  clampQuad,
  defaultQuad,
  imageQuadOf,
  imageToDisplayScale,
  quadCacheKey,
  scaleQuad,
} from "./straighten-quad";

function candidate(quad: Quad, score: number): CardCandidate {
  return { quad, aspect: 0.7, areaFraction: 0.5, rectangularity: 0.95, score };
}

const rect: ImageQuad = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 110, y: 220 },
  { x: 10, y: 220 },
];

describe("defaultQuad", () => {
  it("insets the rectangle by a tenth on every side", () => {
    expect(defaultQuad(1000, 2000)).toStrictEqual([
      { x: 100, y: 200 },
      { x: 900, y: 200 },
      { x: 900, y: 1800 },
      { x: 100, y: 1800 },
    ]);
  });
});

describe("scaleQuad", () => {
  it("multiplies every coordinate", () => {
    expect(scaleQuad(rect, 2)).toStrictEqual([
      { x: 20, y: 40 },
      { x: 220, y: 40 },
      { x: 220, y: 440 },
      { x: 20, y: 440 },
    ]);
  });
});

describe("clampQuad", () => {
  it("pulls corners back inside the image", () => {
    const outside: ImageQuad = [
      { x: -5, y: -5 },
      { x: 150, y: 10 },
      { x: 150, y: 400 },
      { x: 10, y: 400 },
    ];
    expect(clampQuad(outside, 100, 200)).toStrictEqual([
      { x: 0, y: 0 },
      { x: 100, y: 10 },
      { x: 100, y: 200 },
      { x: 10, y: 200 },
    ]);
  });

  it("leaves a quad that already fits untouched", () => {
    expect(clampQuad(rect, 500, 500)).toStrictEqual(rect);
  });
});

describe("bestCandidateQuad", () => {
  it("returns null without candidates", () => {
    expect(bestCandidateQuad([])).toBeNull();
  });

  it("takes the highest score", () => {
    const low = candidate(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
        { x: 0, y: 30 },
      ],
      0.2,
    );
    const high = candidate(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 300 },
        { x: 100, y: 300 },
      ],
      0.9,
    );
    expect(bestCandidateQuad([low, high])?.[0]).toStrictEqual({ x: 100, y: 100 });
  });

  it("starts at the corner nearest the image origin", () => {
    const rotated = candidate(
      [
        { x: 200, y: 100 },
        { x: 200, y: 300 },
        { x: 100, y: 300 },
        { x: 100, y: 100 },
      ],
      0.5,
    );
    const result = bestCandidateQuad([rotated]);
    expect(result?.[0]).toStrictEqual({ x: 100, y: 100 });
  });

  it("keeps the corners going clockwise", () => {
    const scrambled = candidate(
      [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
        { x: 200, y: 300 },
        { x: 200, y: 100 },
      ],
      0.5,
    );
    expect(bestCandidateQuad([scrambled])).toStrictEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 300 },
      { x: 100, y: 300 },
    ]);
  });
});

describe("quadCacheKey", () => {
  it("is stable for the same corners", () => {
    expect(quadCacheKey(rect)).toBe(quadCacheKey([...rect] as ImageQuad));
  });

  it("changes when a corner moves", () => {
    const moved: ImageQuad = [{ x: 11, y: 20 }, rect[1], rect[2], rect[3]];
    expect(quadCacheKey(moved)).not.toBe(quadCacheKey(rect));
  });

  it("has a short token for no quad", () => {
    expect(quadCacheKey(null)).toBe("0");
  });
});

describe("imageToDisplayScale", () => {
  it("divides the displayed width by the natural width", () => {
    expect(imageToDisplayScale(1000, 250)).toBe(0.25);
  });

  it("falls back to 1 before the image is measured", () => {
    expect(imageToDisplayScale(1000, 0)).toBe(1);
    expect(imageToDisplayScale(0, 250)).toBe(1);
  });
});

describe("imageQuadOf", () => {
  it("reads a stored quad", () => {
    expect(imageQuadOf({ quad: rect })).toStrictEqual(rect);
  });

  it("returns null when the field is missing or empty", () => {
    expect(imageQuadOf({})).toBeNull();
    expect(imageQuadOf({ quad: null })).toBeNull();
  });
});
