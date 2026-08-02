import type { Quad } from "@openrift/shared/scan";
import { describe, expect, it, vi } from "vitest";

import { GUIDE_COLOR, RETICLE_COLORS, gradeReticle } from "@/lib/scan-overlay";
import type { OverlayTarget } from "@/lib/scan-overlay-paint";
import { createDrawState, paintOverlay, syncOverlaySize } from "@/lib/scan-overlay-paint";

/** One `stroke()` call, with the state the context carried into it. */
interface Stroke {
  style: string;
  width: number;
  dash: number[];
}

/**
 * A 2D context that records what was drawn.
 *
 * jsdom has no canvas backend, so `getContext("2d")` returns null there; the
 * paint loop only ever writes to the context, which makes a recorder enough
 * to assert on.
 *
 * @returns The context, the strokes it received, and the call names in order.
 */
function fakeContext() {
  const calls: string[] = [];
  const strokes: Stroke[] = [];
  let dash: number[] = [];
  const context = {
    lineWidth: 0,
    lineCap: "butt",
    strokeStyle: "",
    clearRect: () => calls.push("clearRect"),
    beginPath: () => calls.push("beginPath"),
    closePath: () => calls.push("closePath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    arcTo: () => calls.push("arcTo"),
    setLineDash: (next: number[]) => {
      dash = next;
    },
    stroke: () => {
      calls.push("stroke");
      strokes.push({ style: context.strokeStyle, width: context.lineWidth, dash: [...dash] });
    },
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls, strokes };
}

/**
 * A canvas of a fixed size, without jsdom's missing 2D backend.
 *
 * @returns The canvas.
 */
function fakeCanvas(width = 200, height = 400): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

/**
 * A rectangle as a quad, clockwise from the top left.
 *
 * @returns The quad.
 */
function rect(x: number, y: number, width: number, height: number): Quad {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * A target aimed at a guide-mode frame, with overrides applied.
 *
 * @returns The target.
 */
function target(overrides: Partial<OverlayTarget> = {}): OverlayTarget {
  return {
    quad: rect(20, 40, 100, 200),
    guide: rect(10, 20, 120, 240),
    frameWidth: 200,
    frameHeight: 400,
    turns: 0,
    // Deliberately not a winner: the lock ring strokes in the winner colour,
    // and the assertions below tell the two strokes apart by it.
    grade: gradeReticle({
      hasCandidate: true,
      bestInliers: 8,
      refused: false,
      isWinner: false,
    }),
    dashed: false,
    focus: 80,
    lockFraction: 0,
    lockRun: 3,
    ...overrides,
  };
}

describe("createDrawState", () => {
  it("allocates its own corner objects up front", () => {
    const state = createDrawState();

    expect(state.points).toHaveLength(4);
    // The paint loop mutates these in place, so the three sets must not be
    // the same objects.
    expect(state.points[0]).not.toBe(state.mapped[0]);
    expect(state.points[0]).not.toBe(state.guide[0]);
    expect(state.shown).toBe(false);
    expect(state.painted).toBeNull();
  });
});

describe("paintOverlay", () => {
  it("strokes the guide faintly and the brackets in the grade colour", () => {
    const { context, strokes } = fakeContext();
    const aimed = target();

    paintOverlay(fakeCanvas(), context, aimed, createDrawState());

    expect(strokes[0].style).toBe(GUIDE_COLOR);
    expect(strokes.at(-1)?.style).toBe(aimed.grade.color);
    // A sharp frame draws the widest brackets.
    expect(strokes.at(-1)?.width).toBe(4);
  });

  it("dashes the brackets for an unverified guess", () => {
    const { context, strokes } = fakeContext();

    paintOverlay(fakeCanvas(), context, target({ dashed: true }), createDrawState());

    expect(strokes.at(-1)?.dash).toEqual([10, 7]);
  });

  it("falls back to the guide when the frame settled on nothing", () => {
    const { context, strokes } = fakeContext();

    paintOverlay(fakeCanvas(), context, target({ quad: null }), createDrawState());

    // The brackets still draw: they sit on the guide rather than blinking out
    // between frames.
    expect(strokes.at(-1)?.style).not.toBe(GUIDE_COLOR);
  });

  it("skips the whole repaint once the scene has settled", () => {
    const { context, calls } = fakeContext();
    const state = createDrawState();
    const aimed = target();

    paintOverlay(fakeCanvas(), context, aimed, state);
    expect(state.settled).toBe(true);
    calls.length = 0;
    paintOverlay(fakeCanvas(), context, aimed, state);

    // An idle guide must not cost a canvas clear sixty times a second.
    expect(calls).toEqual([]);
  });

  it("repaints when the target changes even if the easing had settled", () => {
    const { context, calls } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target(), state);
    calls.length = 0;
    paintOverlay(fakeCanvas(), context, target({ quad: rect(30, 50, 100, 200) }), state);

    expect(calls).toContain("clearRect");
  });

  it("clears the canvas and forgets the reticle when there is no target", () => {
    const { context, calls } = fakeContext();
    const state = createDrawState();
    paintOverlay(fakeCanvas(), context, target({ lockFraction: 1 }), state);
    calls.length = 0;

    paintOverlay(fakeCanvas(), context, null, state);

    expect(calls).toEqual(["clearRect"]);
    expect(state.shown).toBe(false);
    expect(state.ring).toBe(0);
    expect(state.settled).toBe(true);
  });

  it("eases the lock ring toward the run's progress", () => {
    const { context, strokes } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target({ lockFraction: 1 }), state);

    const ring = strokes.find((stroke) => stroke.style === RETICLE_COLORS.locked);
    expect(ring).toBeDefined();
    // Eased, not snapped: the first frame of a full run draws a partial ring.
    expect(ring?.dash[0]).toBeLessThan(ring?.dash[1] ?? 0);
    expect(state.settled).toBe(false);
  });

  it("draws no lock ring for a one-frame run", () => {
    const { context, strokes } = fakeContext();

    // Capture mode locks on a single tap, so a ring would snap from nothing to
    // full on every shot.
    paintOverlay(fakeCanvas(), context, target({ lockFraction: 1, lockRun: 1 }), createDrawState());

    expect(strokes.some((stroke) => stroke.style === RETICLE_COLORS.locked)).toBe(false);
  });
});

describe("syncOverlaySize", () => {
  it("matches the canvas to the box the video occupies, rounded", () => {
    const canvas = fakeCanvas(0, 0);
    const video = {
      getBoundingClientRect: vi.fn(() => ({ width: 320.4, height: 568.6 })),
    } as unknown as HTMLVideoElement;

    syncOverlaySize(canvas, video);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(569);
  });

  it("leaves an already-matching canvas alone", () => {
    // Assigning width or height clears the canvas, so an unchanged box must
    // not touch either.
    const canvas = { width: 320, height: 569 } as HTMLCanvasElement;
    const setter = vi.fn();
    Object.defineProperty(canvas, "width", { get: () => 320, set: setter });
    const video = {
      getBoundingClientRect: () => ({ width: 320, height: 569 }),
    } as unknown as HTMLVideoElement;

    syncOverlaySize(canvas, video);

    expect(setter).not.toHaveBeenCalled();
  });
});
