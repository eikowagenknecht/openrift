import type { Quad } from "@openrift/shared/scan/types";
import { describe, expect, it, vi } from "vitest";

import { GUIDE_COLOR, RETICLE_COLOR, RETICLE_HOLD_FRAMES } from "@/features/scan/lib/scan-overlay";
import type { OverlayTarget } from "@/features/scan/lib/scan-overlay-paint";
import {
  createDrawState,
  paintOverlay,
  syncOverlaySize,
} from "@/features/scan/lib/scan-overlay-paint";

interface Stroke {
  style: string;
  width: number;
  dash: number[];
}

// jsdom has no canvas backend (`getContext("2d")` returns null there), so
// tests substitute a plain object that records what was drawn.
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

function fakeCanvas(width = 200, height = 400): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}

function rect(x: number, y: number, width: number, height: number): Quad {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function target(overrides: Partial<OverlayTarget> = {}): OverlayTarget {
  return {
    quad: rect(20, 40, 100, 200),
    guide: rect(10, 20, 120, 240),
    frameWidth: 200,
    frameHeight: 400,
    turns: 0,
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
  it("strokes the guide faintly and the brackets in the match colour", () => {
    const { context, strokes } = fakeContext();

    paintOverlay(fakeCanvas(), context, target(), createDrawState());

    expect(strokes[0]!.style).toBe(GUIDE_COLOR);
    expect(strokes.at(-1)?.style).toBe(RETICLE_COLOR);
    expect(strokes.at(-1)?.dash).toEqual([]);
    // A sharp frame draws the widest brackets.
    expect(strokes.at(-1)?.width).toBe(4);
  });

  it("draws the guide alone when the frame matched nothing", () => {
    const { context, strokes } = fakeContext();

    paintOverlay(fakeCanvas(), context, target({ quad: null }), createDrawState());

    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.style).toBe(GUIDE_COLOR);
  });

  it("skips the whole repaint once the scene has settled", () => {
    const { context, calls } = fakeContext();
    const state = createDrawState();
    const aimed = target();

    paintOverlay(fakeCanvas(), context, aimed, state);
    expect(state.settled).toBe(true);
    calls.length = 0;
    paintOverlay(fakeCanvas(), context, aimed, state);

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

    paintOverlay(fakeCanvas(), context, target({ quad: null, lockFraction: 1 }), state);

    const ring = strokes.find((stroke) => stroke.style === RETICLE_COLOR);
    expect(ring).toBeDefined();
    expect(ring?.dash[0]).toBeLessThan(ring?.dash[1] ?? 0);
    expect(state.settled).toBe(false);
  });

  it("eases the aim toward a moved detection instead of jumping to it", () => {
    const { context } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target(), state);
    paintOverlay(fakeCanvas(), context, target({ quad: rect(30, 40, 100, 200) }), state);

    // Consecutive detector quads on a still card differ by several pixels;
    // smoothing avoids drawing each one in full.
    expect(state.smoothed[0]).toEqual({ x: 25, y: 40 });
  });

  it("ignores a proposal that jumps away until a second frame agrees", () => {
    const { context } = fakeContext();
    const state = createDrawState();
    const jumped = target({ quad: rect(20, 90, 100, 200) });

    paintOverlay(fakeCanvas(), context, target(), state);
    paintOverlay(fakeCanvas(), context, jumped, state);
    // A verified quad that lands somewhere else is a different card, so one
    // frame of it is not enough to move the brackets off this one.
    expect(state.smoothed[0]).toEqual({ x: 20, y: 40 });

    paintOverlay(fakeCanvas(), context, target({ quad: rect(20, 90, 100, 200) }), state);

    expect(state.smoothed[0]!.y).toBeGreaterThan(40);
  });

  it("holds the last detection through a short dropout", () => {
    const { context } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target(), state);
    paintOverlay(fakeCanvas(), context, target({ quad: null }), state);

    expect(state.smoothed[0]).toEqual({ x: 20, y: 40 });
  });

  it("releases the hold once the dropout outlasts it", () => {
    const { context, strokes } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target(), state);
    for (let frame = 0; frame < RETICLE_HOLD_FRAMES; frame++) {
      paintOverlay(fakeCanvas(), context, target({ quad: null }), state);
      expect(state.shown).toBe(true);
    }
    strokes.length = 0;
    paintOverlay(fakeCanvas(), context, target({ quad: null }), state);

    expect(strokes.map((stroke) => stroke.style)).toEqual([GUIDE_COLOR]);
  });

  it("starts the aim over when the frame geometry changes", () => {
    const { context } = fakeContext();
    const state = createDrawState();

    paintOverlay(fakeCanvas(), context, target(), state);
    paintOverlay(fakeCanvas(), context, target({ quad: rect(60, 40, 100, 200), turns: 1 }), state);

    // The smoothed quad is in frame pixels, so a quarter turn mid-run makes
    // it mean something else; easing across that would swing the brackets.
    expect(state.smoothed[0]).toEqual({ x: 60, y: 40 });
  });

  it("draws no lock ring for a one-frame run", () => {
    const { context, strokes } = fakeContext();

    const once = target({ quad: null, lockFraction: 1, lockRun: 1 });
    paintOverlay(fakeCanvas(), context, once, createDrawState());

    expect(strokes.some((stroke) => stroke.style === RETICLE_COLOR)).toBe(false);
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
