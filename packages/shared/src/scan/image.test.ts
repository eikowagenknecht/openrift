import { describe, expect, it } from "vitest";

import { boxBlurGray, downscaleGray, focusScore, toGray } from "./image";
import type { GrayImage, RgbaImage } from "./types";

function gray(width: number, height: number, values: number[]): GrayImage {
  return { data: Uint8Array.from(values), width, height };
}

describe("toGray", () => {
  it("weights channels by BT.601 luma", () => {
    const image: RgbaImage = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
    };
    expect([...toGray(image).data]).toEqual([76, 149, 28]);
  });

  it("maps white to full luma", () => {
    const image: RgbaImage = {
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 255]),
    };
    expect([...toGray(image).data]).toEqual([255]);
  });
});

describe("downscaleGray", () => {
  it("averages each source block into its destination bin", () => {
    const src = gray(4, 4, [0, 0, 100, 100, 0, 0, 100, 100, 200, 200, 50, 50, 200, 200, 50, 50]);
    expect([...downscaleGray(src, 2, 2).data]).toEqual([0, 100, 200, 50]);
  });

  it("copies when the size is unchanged", () => {
    const src = gray(2, 2, [1, 2, 3, 4]);
    const out = downscaleGray(src, 2, 2);
    expect([...out.data]).toEqual([1, 2, 3, 4]);
    expect(out.data).not.toBe(src.data);
  });
});

describe("boxBlurGray", () => {
  it("copies at radius zero", () => {
    const src = gray(2, 2, [10, 20, 30, 40]);
    expect([...boxBlurGray(src, 0).data]).toEqual([10, 20, 30, 40]);
  });

  it("keeps a uniform image uniform", () => {
    const src = gray(
      5,
      5,
      Array.from({ length: 25 }, () => 40),
    );
    expect([...boxBlurGray(src, 2).data]).toEqual([...src.data]);
  });
});

describe("focusScore", () => {
  it("is zero for images too small to measure", () => {
    expect(focusScore(gray(2, 2, [0, 255, 255, 0]))).toBe(0);
  });

  it("is zero for a linear ramp and high for a checkerboard", () => {
    const ramp = gray(
      5,
      5,
      Array.from({ length: 25 }, (_, i) => (i % 5) * 50),
    );
    const checker = gray(
      5,
      5,
      Array.from({ length: 25 }, (_, i) => ((i + Math.floor(i / 5)) % 2) * 255),
    );
    expect(focusScore(ramp)).toBe(0);
    expect(focusScore(checker)).toBeGreaterThan(1000);
  });
});
