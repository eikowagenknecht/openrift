/**
 * The scanner overlay's canvas painter, split from the geometry in
 * scan-overlay.ts. {@link OverlayTarget} is written once per processed
 * frame (5-15/s) and read every animation frame; the two cadences never
 * touch each other's state.
 */

import type { Point, Quad } from "@openrift/shared/scan";

import {
  BRACKET_FRACTION,
  GUIDE_COLOR,
  RETICLE_COLOR,
  RETICLE_HOLD_FRAMES,
  RETICLE_JUMP_FRACTION,
  RING_EASE,
  RING_SNAP,
  boundsOfQuad,
  bracketSegments,
  copyQuad,
  coverMapping,
  lockRingDash,
  mapQuad,
  quadMatches,
  reticleLineWidth,
  ringRadiusFor,
  roundedRectPerimeter,
  shouldDrawLockRing,
  smoothQuadToward,
  stepQuadToward,
  stepToward,
} from "@/lib/scan-overlay";

/**
 * Quads are in rotated-frame pixels, not canvas pixels: a resize between
 * processed frames must remap them, not leave the reticle at the old scale.
 */
export interface OverlayTarget {
  quad: Quad | null;
  guide: Quad | null;
  frameWidth: number;
  frameHeight: number;
  turns: number;
  focus: number;
  lockFraction: number;
  lockRun: number;
}

/**
 * Eased state carried between animation frames. Every point object is
 * allocated once and mutated in place; nothing is allocated per frame.
 */
export interface OverlayDrawState {
  points: Point[];
  mapped: Point[];
  guide: Point[];
  smoothed: Point[];
  smoothing: boolean;
  held: Point[];
  holding: boolean;
  proposed: Point[];
  pending: boolean;
  missed: number;
  shown: boolean;
  ring: number;
  painted: OverlayTarget | null;
  settled: boolean;
}

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
    smoothed: corners(),
    smoothing: false,
    held: corners(),
    holding: false,
    proposed: corners(),
    pending: false,
    missed: 0,
    shown: false,
    ring: 0,
    painted: null,
    settled: false,
  };
}

function detectionFrom(target: OverlayTarget, state: OverlayDrawState): readonly Point[] | null {
  const quad = target.quad;
  if (!quad) {
    return null;
  }
  if (!state.smoothing || quadMatches(quad, state.smoothed, RETICLE_JUMP_FRACTION)) {
    state.pending = false;
    return quad;
  }
  const confirmed = state.pending && quadMatches(quad, state.proposed, RETICLE_JUMP_FRACTION);
  copyQuad(quad, state.proposed);
  state.pending = !confirmed;
  return confirmed ? quad : null;
}

function aimAt(target: OverlayTarget, state: OverlayDrawState): void {
  const detected = detectionFrom(target, state);
  if (detected) {
    copyQuad(detected, state.held);
    state.holding = true;
    state.missed = 0;
  } else {
    state.missed++;
    if (state.missed > RETICLE_HOLD_FRAMES) {
      state.holding = false;
    }
  }
  const source = detected ?? (state.holding ? state.held : null);
  if (!source) {
    state.smoothing = false;
    return;
  }
  if (state.smoothing) {
    smoothQuadToward(state.smoothed, source);
  } else {
    copyQuad(source, state.smoothed);
    state.smoothing = true;
  }
}

export function syncOverlaySize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
  const rect = video.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function traceRoundedRect(
  context: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  radius: number,
): void {
  // arcTo, not roundRect: floor is Safari 16.4.
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

export function paintOverlay(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  target: OverlayTarget | null,
  state: OverlayDrawState,
): void {
  const previous = state.painted;
  const fresh = target !== previous;
  if (!fresh && state.settled) {
    return;
  }
  state.painted = target;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!target) {
    state.shown = false;
    state.smoothing = false;
    state.holding = false;
    state.pending = false;
    state.missed = 0;
    state.ring = 0;
    state.settled = true;
    return;
  }
  // Restart on a resolution or rotation change mid-run: the smoothed/held
  // quads are in frame pixels and no longer valid.
  if (
    previous &&
    (previous.frameWidth !== target.frameWidth ||
      previous.frameHeight !== target.frameHeight ||
      previous.turns !== target.turns)
  ) {
    state.smoothing = false;
    state.holding = false;
    state.pending = false;
    state.missed = 0;
    state.shown = false;
  }
  const mapping = coverMapping(
    target.frameWidth,
    target.frameHeight,
    target.turns,
    canvas.width,
    canvas.height,
  );

  if (target.guide) {
    mapQuad(target.guide, mapping, state.guide);
    const [start, ...rest] = state.guide;
    if (start) {
      context.beginPath();
      context.moveTo(start.x, start.y);
      for (const point of rest) {
        context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.lineWidth = 2;
      context.lineCap = "butt";
      context.strokeStyle = GUIDE_COLOR;
      context.stroke();
    }
  }

  if (fresh) {
    aimAt(target, state);
  }
  let settled = true;
  if (state.smoothing) {
    mapQuad(state.smoothed, mapping, state.mapped);
    if (state.shown) {
      settled = stepQuadToward(state.points, state.mapped);
    } else {
      copyQuad(state.mapped, state.points);
      state.shown = true;
    }
  } else {
    state.shown = false;
  }

  state.ring = stepToward(state.ring, target.lockFraction, RING_EASE, RING_SNAP);
  state.settled = settled && state.ring === target.lockFraction;
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
      context.strokeStyle = RETICLE_COLOR;
      context.stroke();
      context.setLineDash([]);
    }
  }

  if (!state.shown) {
    return;
  }
  context.lineWidth = reticleLineWidth(target.focus);
  context.lineCap = "round";
  context.strokeStyle = RETICLE_COLOR;
  context.beginPath();
  for (const leg of bracketSegments(state.points, BRACKET_FRACTION)) {
    context.moveTo(leg.ax, leg.ay);
    context.lineTo(leg.bx, leg.by);
  }
  context.stroke();
}
