import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import { describe, expect, it } from "vitest";

import { moveQuadCorner, pointerToImagePoint } from "./use-quad-handles";

const quad: ImageQuad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

describe("pointerToImagePoint", () => {
  it("maps a pointer on the displayed image to original pixels", () => {
    const point = pointerToImagePoint(60, 110, { left: 10, top: 20, width: 200 }, 800);
    expect(point).toStrictEqual({ x: 200, y: 360 });
  });

  it("maps at 1:1 when the image is shown at its natural width", () => {
    expect(pointerToImagePoint(30, 40, { left: 0, top: 0, width: 800 }, 800)).toStrictEqual({
      x: 30,
      y: 40,
    });
  });
});

describe("moveQuadCorner", () => {
  it("replaces one corner and copies the rest", () => {
    const next = moveQuadCorner(quad, 2, { x: 90, y: 190 });
    expect(next).toStrictEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 90, y: 190 },
      { x: 0, y: 200 },
    ]);
  });

  it("does not mutate the input", () => {
    moveQuadCorner(quad, 0, { x: 5, y: 5 });
    expect(quad[0]).toStrictEqual({ x: 0, y: 0 });
  });
});
