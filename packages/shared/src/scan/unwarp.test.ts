import { describe, expect, it } from "vitest";

import type { Quad, RgbaImage } from "./types";
import { unwarpCard } from "./unwarp";

function rgba(width: number, height: number, gray: (x: number, y: number) => number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = gray(x, y);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 0;
    }
  }
  return { data, width, height };
}

function corners(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function redChannels(image: RgbaImage): number[] {
  const out: number[] = [];
  for (let i = 0; i < image.data.length; i += 4) {
    out.push(image.data[i] ?? -1);
  }
  return out;
}

describe("unwarpCard", () => {
  it("reproduces the frame pixel for pixel when the quad is the frame itself", () => {
    const frame = rgba(3, 3, (x, y) => y * 30 + x * 10);
    const out = unwarpCard(frame, corners(3, 3), 3, 3);
    expect(redChannels(out!)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("returns an opaque image regardless of the source alpha", () => {
    const frame = rgba(2, 2, () => 100);
    const out = unwarpCard(frame, corners(2, 2), 2, 2);
    expect([...out!.data].filter((_unused, index) => index % 4 === 3)).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it("returns the requested output size, not the frame's", () => {
    const frame = rgba(8, 8, () => 42);
    const out = unwarpCard(frame, corners(8, 8), 3, 5);
    expect({ width: out!.width, height: out!.height }).toEqual({ width: 3, height: 5 });
    expect(redChannels(out!)).toEqual(Array.from({ length: 15 }, () => 42));
  });

  it("turns a horizontal split into a vertical one for a quarter-turned quad", () => {
    const frame = rgba(9, 9, (_x, y) => (y < 4 ? 0 : 200));
    const quarterTurned: Quad = [
      { x: 0, y: 9 },
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 9 },
    ];
    const out = unwarpCard(frame, quarterTurned, 3, 3);
    expect(redChannels(out!)).toEqual([200, 200, 0, 200, 200, 0, 200, 200, 0]);
  });

  it("samples further inside the quad when padding is given", () => {
    const frame = rgba(8, 8, (x) => (x >= 2 && x <= 5 ? 200 : 0));
    expect(redChannels(unwarpCard(frame, corners(8, 8), 2, 2)!)).toEqual([100, 100, 100, 100]);
    expect(redChannels(unwarpCard(frame, corners(8, 8), 2, 2, 0.25)!)).toEqual([
      200, 200, 200, 200,
    ]);
  });

  it("clamps to the border instead of reading outside the frame", () => {
    const frame = rgba(4, 4, () => 90);
    const oversized: Quad = [
      { x: -10, y: -10 },
      { x: 14, y: -10 },
      { x: 14, y: 14 },
      { x: -10, y: 14 },
    ];
    expect(redChannels(unwarpCard(frame, oversized, 4, 4)!)).toEqual(
      Array.from({ length: 16 }, () => 90),
    );
  });

  it("returns null for a degenerate quad with no solvable homography", () => {
    const frame = rgba(4, 4, () => 10);
    const collapsed: Quad = [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(unwarpCard(frame, collapsed, 4, 4)).toBeNull();
  });
});
