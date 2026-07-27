import { describe, expect, it } from "vitest";

import {
  applyHomography,
  boundingBox,
  canonicalizeQuad,
  computeHomography,
  quadIou,
  refineQuad,
} from "./geometry";
import type { Point, Quad } from "./types";

const UNIT_SQUARE: Quad = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("canonicalizeQuad", () => {
  it("starts on a short side so the long axis maps to vertical", () => {
    const portrait: Quad = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 90 },
      { x: 0, y: 90 },
    ];
    const ordered = canonicalizeQuad(portrait);
    const first = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
    const second = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
    expect(first).toBeLessThan(second);
  });

  it("also starts on a short side for a landscape quad", () => {
    const landscape: Quad = [
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 90, y: 60 },
      { x: 0, y: 60 },
    ];
    const ordered = canonicalizeQuad(landscape);
    const first = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
    const second = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
    expect(first).toBeLessThan(second);
  });
});

describe("computeHomography", () => {
  it("maps each source corner onto its target", () => {
    const target: Quad = [
      { x: 5, y: 3 },
      { x: 40, y: 8 },
      { x: 38, y: 55 },
      { x: 2, y: 48 },
    ];
    const h = computeHomography(UNIT_SQUARE, target);
    expect(h).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(h as never, UNIT_SQUARE[i]);
      expect(mapped.x).toBeCloseTo(target[i].x, 5);
      expect(mapped.y).toBeCloseTo(target[i].y, 5);
    }
  });

  it("returns null for a degenerate quad", () => {
    const degenerate: Quad = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(computeHomography(degenerate, UNIT_SQUARE)).toBeNull();
  });
});

describe("refineQuad", () => {
  it("pushes corners out to where the straight sides meet", () => {
    // Points along the four sides of a 100x140 rectangle, with the corner
    // regions missing the way a rounded card's outline is.
    const contour: Point[] = [];
    for (let t = 15; t <= 85; t += 2) {
      contour.push({ x: t, y: 0 }, { x: t, y: 140 });
    }
    for (let t = 20; t <= 120; t += 2) {
      contour.push({ x: 0, y: t }, { x: 100, y: t });
    }
    // A quad whose corners sit slightly inside the true ones, as a hull over a
    // rounded outline gives. Corrections beyond a few percent of the diagonal
    // are deliberately rejected, so the starting error has to be a realistic
    // one.
    const rough: Quad = [
      { x: 3, y: 3 },
      { x: 97, y: 3 },
      { x: 97, y: 137 },
      { x: 3, y: 137 },
    ];
    const refined = refineQuad(rough, contour);
    expect(refined[0].x).toBeCloseTo(0, 0);
    expect(refined[0].y).toBeCloseTo(0, 0);
    expect(refined[2].x).toBeCloseTo(100, 0);
    expect(refined[2].y).toBeCloseTo(140, 0);
  });

  it("keeps the input when there are too few points to fit sides", () => {
    expect(refineQuad(UNIT_SQUARE, [{ x: 1, y: 1 }])).toEqual(UNIT_SQUARE);
  });
});

describe("quadIou", () => {
  it("is one for identical quads", () => {
    expect(quadIou(UNIT_SQUARE, UNIT_SQUARE)).toBeCloseTo(1, 6);
  });

  it("is zero for disjoint quads", () => {
    const far: Quad = [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
      { x: 110, y: 110 },
      { x: 100, y: 110 },
    ];
    expect(quadIou(UNIT_SQUARE, far)).toBe(0);
  });

  it("is a third for quads overlapping on half their area", () => {
    const shifted: Quad = [
      { x: 5, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
    ];
    expect(quadIou(UNIT_SQUARE, shifted)).toBeCloseTo(50 / 150, 6);
  });
});

describe("boundingBox", () => {
  it("covers every corner", () => {
    expect(boundingBox(UNIT_SQUARE)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});
