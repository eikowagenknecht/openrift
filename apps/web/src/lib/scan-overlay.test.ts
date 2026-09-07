import type { Point } from "@openrift/shared/scan";
import { describe, expect, it } from "vitest";

import {
  BRACKET_FRACTION,
  FOCUS_SHARP,
  FOCUS_SOFT,
  HOLD_STEADY_MAX_INLIERS,
  HOLD_STEADY_MIN_INLIERS,
  RETICLE_COLORS,
  RETICLE_WIDTH_MAX,
  RETICLE_WIDTH_MIN,
  boundsOfQuad,
  bracketSegments,
  copyQuad,
  coverMapping,
  gradeReticle,
  lockRingDash,
  lockRingFraction,
  mapQuad,
  quadDiagonal,
  quadMatches,
  quadOffsetTo,
  quadsWithin,
  reticleLineWidth,
  ringRadiusFor,
  roundedRectPerimeter,
  shouldDrawLockRing,
  smoothQuadToward,
  stepQuadToward,
  stepToward,
  unrotatePoint,
} from "./scan-overlay";

function signals(overrides: Partial<Parameters<typeof gradeReticle>[0]> = {}) {
  return { hasCandidate: true, bestInliers: 0, refused: false, isWinner: false, ...overrides };
}

function rect(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

describe("gradeReticle", () => {
  it("grades a verified winner green, whatever else the frame says", () => {
    const grade = gradeReticle(signals({ isWinner: true, refused: true, bestInliers: 2 }));

    expect(grade.state).toBe("locked");
    expect(grade.color).toBe(RETICLE_COLORS.locked);
  });

  it("grades a refused frame amber", () => {
    expect(gradeReticle(signals({ refused: true, bestInliers: 30 })).state).toBe("refused");
  });

  it("falls back to idle when no candidate was settled on", () => {
    const grade = gradeReticle(signals({ hasCandidate: false }));

    expect(grade.state).toBe("idle");
    expect(grade.color).toBe(RETICLE_COLORS.idle);
  });

  it("grades a seen but far-from-verified card neutral", () => {
    expect(gradeReticle(signals({ bestInliers: HOLD_STEADY_MIN_INLIERS - 1 })).state).toBe(
      "seeking",
    );
  });

  it("grades both ends of the hold-steady band amber", () => {
    expect(gradeReticle(signals({ bestInliers: HOLD_STEADY_MIN_INLIERS })).state).toBe("steady");
    expect(gradeReticle(signals({ bestInliers: HOLD_STEADY_MAX_INLIERS })).state).toBe("steady");
  });

  it("leaves the band again one inlier past its top", () => {
    expect(gradeReticle(signals({ bestInliers: HOLD_STEADY_MAX_INLIERS + 1 })).state).toBe(
      "seeking",
    );
  });
});

describe("stepToward", () => {
  it("closes a fraction of the gap per step", () => {
    expect(stepToward(0, 100, 0.25, 0.5)).toBe(25);
    expect(stepToward(25, 100, 0.25, 0.5)).toBe(43.75);
  });

  it("snaps once the remainder is inside the snap distance", () => {
    expect(stepToward(99.7, 100, 0.25, 0.5)).toBe(100);
    expect(stepToward(100.4, 100, 0.25, 0.5)).toBe(100);
  });

  it("eases downward as well as upward", () => {
    expect(stepToward(100, 0, 0.5, 0.5)).toBe(50);
  });

  it("clamps the factor so a bad caller cannot overshoot", () => {
    expect(stepToward(0, 100, 4, 0.5)).toBe(100);
    expect(stepToward(0, 100, -1, 0.5)).toBe(0);
  });
});

describe("stepQuadToward", () => {
  it("eases every corner in place", () => {
    const current = rect(0, 0, 0, 0);

    const settled = stepQuadToward(current, rect(0, 0, 100, 100), 0.5, 0.5);

    expect(current[1]).toEqual({ x: 50, y: 0 });
    expect(current[2]).toEqual({ x: 50, y: 50 });
    expect(settled).toBe(false);
  });

  it("reports settled once every corner has arrived", () => {
    const current = rect(0, 0, 100, 100);

    expect(stepQuadToward(current, rect(0, 0, 100, 100), 0.5, 0.5)).toBe(true);
    expect(stepQuadToward(current, rect(0, 0, 100, 140), 0.5, 0.5)).toBe(false);
  });

  it("ignores corners the target does not have", () => {
    const current = rect(0, 0, 10, 10);

    stepQuadToward(current, [{ x: 100, y: 100 }], 0.5, 0.5);

    expect(current[0]).toEqual({ x: 50, y: 50 });
    expect(current[3]).toEqual({ x: 0, y: 10 });
  });
});

describe("quadOffsetTo", () => {
  it("keeps the numbering when the corners already line up", () => {
    expect(quadOffsetTo(rect(0, 0, 100, 200), rect(2, 1, 100, 200))).toBe(0);
  });

  it("finds the rotation that undoes a renumbered quad", () => {
    const reference = rect(0, 0, 100, 200);
    const renumbered = [reference[1], reference[2], reference[3], reference[0]];

    expect(quadOffsetTo(renumbered, reference)).toBe(3);
  });

  it("leaves an incomplete quad alone", () => {
    expect(quadOffsetTo([{ x: 0, y: 0 }], rect(0, 0, 100, 200))).toBe(0);
  });
});

describe("smoothQuadToward", () => {
  it("moves each corner a fraction of the way to the detection", () => {
    const current = rect(0, 0, 100, 200);

    smoothQuadToward(current, rect(10, 20, 100, 200), 0.5);

    expect(current[0]).toEqual({ x: 5, y: 10 });
    expect(current[2]).toEqual({ x: 105, y: 210 });
  });

  it("does not move at all when only the corner numbering changed", () => {
    const current = rect(0, 0, 100, 200);
    const detection = rect(0, 0, 100, 200);

    smoothQuadToward(current, [detection[1], detection[2], detection[3], detection[0]], 0.5);

    expect(current).toEqual(rect(0, 0, 100, 200));
  });
});

describe("copyQuad", () => {
  it("overwrites the corners without replacing the objects", () => {
    const out = rect(0, 0, 0, 0);
    const first = out[0];

    copyQuad(rect(10, 20, 100, 200), out);

    expect(out[2]).toEqual({ x: 110, y: 220 });
    expect(out[0]).toBe(first);
  });
});

describe("quadsWithin", () => {
  it("accepts corners inside the tolerance and rejects one outside it", () => {
    expect(quadsWithin(rect(0, 0, 100, 200), rect(0.4, 0, 100, 200), 0.5)).toBe(true);
    expect(quadsWithin(rect(0, 0, 100, 200), rect(0, 0, 100, 201), 0.5)).toBe(false);
  });

  it("rejects quads of different lengths", () => {
    expect(quadsWithin(rect(0, 0, 100, 200), [{ x: 0, y: 0 }], 100)).toBe(false);
  });
});

describe("quadDiagonal", () => {
  it("measures the longer diagonal", () => {
    expect(quadDiagonal(rect(0, 0, 30, 40))).toBe(50);
  });

  it("returns zero for an incomplete quad", () => {
    expect(quadDiagonal([{ x: 0, y: 0 }])).toBe(0);
  });
});

describe("quadMatches", () => {
  it("scales its tolerance to the reference's own size", () => {
    expect(quadMatches(rect(10, 0, 300, 400), rect(0, 0, 300, 400), 0.05)).toBe(true);
    expect(quadMatches(rect(10, 0, 30, 40), rect(0, 0, 30, 40), 0.05)).toBe(false);
  });

  it("looks past a renumbered quad", () => {
    const reference = rect(0, 0, 300, 400);

    expect(
      quadMatches([reference[2], reference[3], reference[0], reference[1]], reference, 0.05),
    ).toBe(true);
  });

  it("rejects an incomplete quad", () => {
    expect(quadMatches([{ x: 0, y: 0 }], rect(0, 0, 300, 400), 1)).toBe(false);
  });
});

describe("bracketSegments", () => {
  it("returns two legs per corner, each a fraction of its edge", () => {
    const legs = bracketSegments(rect(0, 0, 100, 200), 0.1);

    expect(legs).toHaveLength(8);
    expect(legs[0]).toEqual({ ax: 0, ay: 0, bx: 10, by: 0 });
    expect(legs[1]).toEqual({ ax: 0, ay: 0, bx: 0, by: 20 });
  });

  it("caps the reach at half an edge so opposing brackets never merge", () => {
    const legs = bracketSegments(rect(0, 0, 100, 100), 0.9);

    expect(legs[0]).toEqual({ ax: 0, ay: 0, bx: 50, by: 0 });
  });

  it("drops legs on a zero-length edge", () => {
    const collapsed: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    const legs = bracketSegments(collapsed, BRACKET_FRACTION);

    expect(legs).toHaveLength(6);
    expect(legs.every((leg) => leg.ax !== leg.bx || leg.ay !== leg.by)).toBe(true);
  });

  it("draws nothing for a fully degenerate quad", () => {
    expect(bracketSegments(rect(20, 20, 0, 0), BRACKET_FRACTION)).toEqual([]);
  });

  it("draws nothing for a non-positive fraction or a short quad", () => {
    expect(bracketSegments(rect(0, 0, 100, 100), 0)).toEqual([]);
    expect(bracketSegments([{ x: 0, y: 0 }], BRACKET_FRACTION)).toEqual([]);
  });
});

describe("reticleLineWidth", () => {
  it("bottoms out at or below the blur floor", () => {
    expect(reticleLineWidth(0)).toBe(RETICLE_WIDTH_MIN);
    expect(reticleLineWidth(FOCUS_SOFT)).toBe(RETICLE_WIDTH_MIN);
  });

  it("tops out at a sharp aim and stays there", () => {
    expect(reticleLineWidth(FOCUS_SHARP)).toBe(RETICLE_WIDTH_MAX);
    expect(reticleLineWidth(5000)).toBe(RETICLE_WIDTH_MAX);
  });

  it("ramps in between", () => {
    const mid = reticleLineWidth((FOCUS_SOFT + FOCUS_SHARP) / 2);

    expect(mid).toBeCloseTo((RETICLE_WIDTH_MIN + RETICLE_WIDTH_MAX) / 2, 6);
  });

  it("treats a missing measurement as blurry", () => {
    expect(reticleLineWidth(Number.NaN)).toBe(RETICLE_WIDTH_MIN);
  });
});

describe("boundsOfQuad", () => {
  it("bounds a rotated quad", () => {
    const bounds = boundsOfQuad([
      { x: 10, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 20 },
      { x: 0, y: 10 },
    ]);

    expect(bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("returns an empty rect for an empty quad", () => {
    expect(boundsOfQuad([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("roundedRectPerimeter", () => {
  it("matches the plain rectangle when there is no rounding", () => {
    expect(roundedRectPerimeter(100, 50, 0)).toBe(300);
  });

  it("trades straight runs for quarter circles", () => {
    expect(roundedRectPerimeter(100, 50, 10)).toBeCloseTo(220 + 2 * Math.PI * 10, 6);
  });

  it("caps the radius at half the shorter side, giving a circle", () => {
    expect(roundedRectPerimeter(50, 50, 999)).toBeCloseTo(2 * Math.PI * 25, 6);
  });

  it("is zero for a rect with no extent", () => {
    expect(roundedRectPerimeter(0, 50, 4)).toBe(0);
  });
});

describe("ringRadiusFor", () => {
  it("uses the fixed rounding on a card-sized rect", () => {
    expect(ringRadiusFor(300, 420)).toBe(16);
  });

  it("shrinks with the rect and never goes negative", () => {
    expect(ringRadiusFor(60, 420)).toBe(10);
    expect(ringRadiusFor(0, 0)).toBe(0);
  });
});

describe("lockRingFraction", () => {
  it("reports progress through the run", () => {
    expect(lockRingFraction(2, 4)).toBe(0.5);
  });

  it("clamps a run that ran past the lock", () => {
    expect(lockRingFraction(9, 3)).toBe(1);
  });

  it("is zero without a run or a target", () => {
    expect(lockRingFraction(0, 3)).toBe(0);
    expect(lockRingFraction(-2, 3)).toBe(0);
    expect(lockRingFraction(2, 0)).toBe(0);
    expect(lockRingFraction(Number.NaN, 3)).toBe(0);
  });
});

describe("shouldDrawLockRing", () => {
  it("draws a partially filled multi-frame run", () => {
    expect(shouldDrawLockRing(0.34, 3)).toBe(true);
  });

  it("stays hidden at zero progress", () => {
    expect(shouldDrawLockRing(0, 4)).toBe(false);
  });

  it("never draws for a one-frame lock run", () => {
    expect(shouldDrawLockRing(1, 1)).toBe(false);
  });
});

describe("lockRingDash", () => {
  it("fills the requested fraction and hides the rest", () => {
    expect(lockRingDash(200, 0.25)).toEqual([50, 200]);
  });

  it("clamps the fraction at both ends", () => {
    expect(lockRingDash(200, 3)).toEqual([200, 200]);
    expect(lockRingDash(200, -1)).toEqual([0, 200]);
  });
});

describe("unrotatePoint", () => {
  it("passes a frame through when no turns were adopted", () => {
    const point = { x: 3, y: 7 };

    expect(unrotatePoint(point, 100, 200, 0)).toBe(point);
  });

  it("undoes each quarter turn", () => {
    expect(unrotatePoint({ x: 10, y: 20 }, 100, 200, 1)).toEqual({ x: 20, y: 90 });
    expect(unrotatePoint({ x: 10, y: 20 }, 100, 200, 2)).toEqual({ x: 90, y: 180 });
    expect(unrotatePoint({ x: 10, y: 20 }, 100, 200, 3)).toEqual({ x: 180, y: 10 });
  });
});

describe("coverMapping", () => {
  it("centres the crop on the axis the canvas is tighter in", () => {
    const mapping = coverMapping(100, 200, 0, 100, 100);

    expect(mapping.scale).toBe(1);
    expect(mapping.offsetX).toBe(0);
    expect(mapping.offsetY).toBe(-50);
  });

  it("swaps the displayed axes for an odd number of turns", () => {
    const mapping = coverMapping(100, 200, 1, 200, 100);

    expect(mapping.scale).toBe(1);
    expect(mapping.offsetX).toBe(0);
    expect(mapping.offsetY).toBe(0);
  });

  it("survives a frame with no dimensions", () => {
    expect(coverMapping(0, 0, 0, 300, 300).scale).toBe(1);
  });
});

describe("mapQuad", () => {
  it("maps a quad through the cover crop into the caller's array", () => {
    const out = rect(0, 0, 0, 0);

    mapQuad(rect(10, 20, 30, 40), coverMapping(100, 100, 0, 200, 200), out);

    expect(out[0]).toEqual({ x: 20, y: 40 });
    expect(out[2]).toEqual({ x: 80, y: 120 });
  });

  it("leaves slots the output array does not have", () => {
    const out: Point[] = [{ x: 0, y: 0 }];

    mapQuad(rect(0, 0, 10, 10), coverMapping(10, 10, 0, 10, 10), out);

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ x: 0, y: 0 });
  });
});
