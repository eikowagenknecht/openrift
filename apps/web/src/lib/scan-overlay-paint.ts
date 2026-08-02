/**
 * The scanner overlay's canvas painter.
 *
 * Split from the geometry in `scan-overlay.ts` along the line between "what
 * should be drawn" and "draw it": that file is pure maths, this one owns the
 * 2D context. Between them sits {@link OverlayTarget}, the single handover
 * from the pipeline to the paint loop — written once per processed frame
 * (5-15 a second) and read on every animation frame, which is why the two
 * cadences never touch each other's state.
 *
 * Nothing here is React-aware: the hook holds the canvas refs and the
 * animation-frame loop, and calls {@link paintOverlay} with the target the
 * last processed frame produced.
 */

import type { Point, Quad } from "@openrift/shared/scan";

import type { ReticleGrade } from "@/lib/scan-overlay";
import {
  BRACKET_FRACTION,
  GUIDE_COLOR,
  RETICLE_COLORS,
  RING_EASE,
  RING_SNAP,
  boundsOfQuad,
  bracketSegments,
  coverMapping,
  lockRingDash,
  mapQuad,
  reticleLineWidth,
  ringRadiusFor,
  roundedRectPerimeter,
  shouldDrawLockRing,
  stepQuadToward,
  stepToward,
} from "@/lib/scan-overlay";

/**
 * What the last processed frame told the overlay to aim at. Written once per
 * pipeline frame, read by the paint loop on every animation frame — the two
 * run at completely different rates, and this object is the whole handover.
 *
 * Quads stay in rotated-frame pixels rather than canvas pixels so a resize
 * between processed frames re-maps correctly instead of leaving the reticle
 * behind at the old scale.
 */
export interface OverlayTarget {
  /** Detector proposal, null when the frame settled on nothing. */
  quad: Quad | null;
  /** The guide rect, null in pan mode, which has none. */
  guide: Quad | null;
  frameWidth: number;
  frameHeight: number;
  turns: number;
  grade: ReticleGrade;
  /** Unverified guess: dashed, so it never reads as a recognised card. */
  dashed: boolean;
  focus: number;
  /** Lock-run progress as a fraction of the run needed to lock. */
  lockFraction: number;
  lockRun: number;
}

/**
 * The eased state the paint loop carries between animation frames. Every
 * point object is allocated once and mutated in place: this runs at display
 * rate over a live camera preview, so the loop allocates nothing per frame.
 */
export interface OverlayDrawState {
  /** Drawn corners, in canvas pixels, chasing {@link OverlayDrawState.mapped}. */
  points: Point[];
  /** The current target, mapped into canvas pixels. */
  mapped: Point[];
  /** The guide rect, mapped into canvas pixels. */
  guide: Point[];
  /** False until a target lands, so the reticle appears in place rather than
   * sliding in from wherever the last run left it. */
  shown: boolean;
  /** Eased lock-ring fill. */
  ring: number;
  /** The target the canvas currently shows, and whether the easing has caught
   * up with it. A settled scene repaints nothing at all — on the phones where
   * the pipeline already saturates the CPU, an idle guide must not also cost a
   * full canvas clear sixty times a second. */
  painted: OverlayTarget | null;
  settled: boolean;
}

/**
 * A fresh draw state, with its point objects allocated up front.
 *
 * @returns The state, with nothing shown yet.
 */
export function createDrawState(): OverlayDrawState {
  const corners = () => [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  return {
    points: corners(),
    mapped: corners(),
    guide: corners(),
    shown: false,
    ring: 0,
    painted: null,
    settled: false,
  };
}

/**
 * Match the overlay canvas to the box the video occupies.
 *
 * The only layout read in the whole overlay path: the paint loop never
 * measures, it reads the canvas's own width and height attributes.
 *
 * @returns Nothing; the canvas is resized when the box changed.
 */
export function syncOverlaySize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const rect = video.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * Trace a rounded rectangle clockwise from the top edge's midpoint.
 *
 * The start point is what makes the lock ring readable: a dashed stroke fills
 * from there, so progress grows symmetrically out of the top of the guide
 * instead of out of a corner. Built from `arcTo` rather than `roundRect`,
 * which only reaches back to Safari 16.4, the exact browser floor.
 *
 * @returns Nothing; the path is left current on the context.
 */
function traceRoundedRect(
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
): void {
  const { x, y, width, height } = rect;
  const right = x + width;
  const bottom = y + height;
  const midX = x + width / 2;
  context.beginPath();
  context.moveTo(midX, y);
  context.lineTo(right - radius, y);
  context.arcTo(right, y, right, y + radius, radius);
  context.lineTo(right, bottom - radius);
  context.arcTo(right, bottom, right - radius, bottom, radius);
  context.lineTo(x + radius, bottom);
  context.arcTo(x, bottom, x, bottom - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.lineTo(midX, y);
}

/**
 * Paint one animation frame of the overlay: the faint guide outline, the lock
 * ring, and the tracking corner brackets.
 *
 * @returns Nothing; the canvas is drawn on directly.
 */
export function paintOverlay(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  target: OverlayTarget | null,
  state: OverlayDrawState,
): void {
  // Nothing moved and nothing new landed: what is on the canvas is already
  // right, so the cheapest frame is the one that does not paint.
  if (target === state.painted && state.settled) {
    return;
  }
  state.painted = target;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!target) {
    state.shown = false;
    state.ring = 0;
    state.settled = true;
    return;
  }
  const mapping = coverMapping(
    target.frameWidth,
    target.frameHeight,
    target.turns,
    canvas.width,
    canvas.height,
  );

  // The guide is a hint, not a verdict: barely there, so the brackets carry
  // every bit of the emphasis.
  if (target.guide) {
    mapQuad(target.guide, mapping, state.guide);
    context.beginPath();
    context.moveTo(state.guide[0].x, state.guide[0].y);
    for (let index = 1; index < state.guide.length; index++) {
      context.lineTo(state.guide[index].x, state.guide[index].y);
    }
    context.closePath();
    context.lineWidth = 2;
    context.lineCap = "butt";
    context.strokeStyle = GUIDE_COLOR;
    context.stroke();
  }

  // With no candidate the brackets sit on the guide itself, so the reticle is
  // always somewhere sensible and never blinks in and out between frames.
  const source = target.quad ?? target.guide;
  let settled = true;
  if (source) {
    mapQuad(source, mapping, state.mapped);
    if (state.shown) {
      settled = stepQuadToward(state.points, state.mapped);
    } else {
      for (const [index, point] of state.points.entries()) {
        point.x = state.mapped[index].x;
        point.y = state.mapped[index].y;
      }
      state.shown = true;
    }
  } else {
    state.shown = false;
  }

  state.ring = stepToward(state.ring, target.lockFraction, RING_EASE, RING_SNAP);
  state.settled = settled && state.ring === target.lockFraction;
  // Around the guide when there is one; in pan mode the tracked card is the
  // only fixed thing on screen, so the ring rides it instead.
  const ringQuad = target.guide ? state.guide : state.shown ? state.points : null;
  if (ringQuad && shouldDrawLockRing(state.ring, target.lockRun)) {
    const rect = boundsOfQuad(ringQuad);
    const radius = ringRadiusFor(rect.width, rect.height);
    const perimeter = roundedRectPerimeter(rect.width, rect.height, radius);
    if (perimeter > 0) {
      traceRoundedRect(context, rect, radius);
      context.setLineDash(lockRingDash(perimeter, state.ring));
      context.lineWidth = 4;
      context.lineCap = "round";
      context.strokeStyle = RETICLE_COLORS.locked;
      context.stroke();
      context.setLineDash([]);
    }
  }

  if (!state.shown) {
    return;
  }
  context.lineWidth = reticleLineWidth(target.focus);
  context.lineCap = "round";
  context.strokeStyle = target.grade.color;
  context.setLineDash(target.dashed ? [10, 7] : []);
  context.beginPath();
  for (const leg of bracketSegments(state.points, BRACKET_FRACTION)) {
    context.moveTo(leg.ax, leg.ay);
    context.lineTo(leg.bx, leg.by);
  }
  context.stroke();
  context.setLineDash([]);
}
