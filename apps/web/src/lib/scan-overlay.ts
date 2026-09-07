/**
 * Coordinates come in three flavours and never mix: quads from the pipeline
 * are in *rotated frame* pixels, the video element displays the *unrotated*
 * frame, and the canvas draws in CSS pixels. {@link coverMapping} and
 * {@link mapQuad} are the only bridge between them.
 */

import type { Point } from "@openrift/shared/scan";

import { clamp } from "@/lib/math";

const RETICLE_EASE = 0.15;
const RETICLE_SNAP_PX = 0.5;
const RETICLE_TARGET_EASE = 0.5;
export const RETICLE_HOLD_FRAMES = 3;
export const RETICLE_JUMP_FRACTION = 0.08;

export const RING_EASE = 0.18;
export const RING_SNAP = 0.004;
export const BRACKET_FRACTION = 0.18;

export const RETICLE_COLOR = "rgba(74, 222, 128, 0.95)";
export const GUIDE_COLOR = "rgba(255, 255, 255, 0.18)";

export function stepToward(current: number, target: number, factor: number, snap: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= snap) {
    return target;
  }
  return current + delta * clamp(factor, 0, 1);
}

/** Mutates in place: this runs every animation frame and the caller owns the corner objects. */
export function stepQuadToward(
  current: Point[],
  target: readonly Point[],
  factor = RETICLE_EASE,
  snap = RETICLE_SNAP_PX,
): boolean {
  let settled = true;
  for (const [index, point] of current.entries()) {
    const to = target[index];
    if (!to) {
      continue;
    }
    point.x = stepToward(point.x, to.x, factor, snap);
    point.y = stepToward(point.y, to.y, factor, snap);
    settled &&= point.x === to.x && point.y === to.y;
  }
  return settled;
}

/**
 * The pipeline can renumber a quad's four corners between frames (angular
 * sort wraps at half a turn, short-side tie flips). Finds the cyclic offset
 * that best lines `quad` up with `reference` so easing tracks the same corner.
 */
export function quadOffsetTo(quad: readonly Point[], reference: readonly Point[]): number {
  if (quad.length < 4 || reference.length < 4) {
    return 0;
  }
  let bestOffset = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < 4; offset++) {
    let cost = 0;
    for (let index = 0; index < 4; index++) {
      const from = quad[(index + offset) % 4];
      const to = reference[index];
      cost += Math.hypot(from.x - to.x, from.y - to.y);
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

export function smoothQuadToward(
  current: Point[],
  target: readonly Point[],
  factor = RETICLE_TARGET_EASE,
): void {
  const offset = quadOffsetTo(target, current);
  for (const [index, point] of current.entries()) {
    const to = target[(index + offset) % target.length];
    if (!to) {
      continue;
    }
    point.x += (to.x - point.x) * clamp(factor, 0, 1);
    point.y += (to.y - point.y) * clamp(factor, 0, 1);
  }
}

export function copyQuad(quad: readonly Point[], out: Point[]): void {
  for (const [index, point] of out.entries()) {
    const from = quad[index];
    if (from) {
      point.x = from.x;
      point.y = from.y;
    }
  }
}

export function quadDiagonal(quad: readonly Point[]): number {
  if (quad.length < 4) {
    return 0;
  }
  return Math.max(
    Math.hypot(quad[2].x - quad[0].x, quad[2].y - quad[0].y),
    Math.hypot(quad[3].x - quad[1].x, quad[3].y - quad[1].y),
  );
}

export function quadMatches(
  quad: readonly Point[],
  reference: readonly Point[],
  fraction: number,
): boolean {
  if (quad.length < 4 || reference.length < 4) {
    return false;
  }
  const limit = fraction * quadDiagonal(reference);
  const offset = quadOffsetTo(quad, reference);
  return reference.every((point, index) => {
    const from = quad[(index + offset) % 4];
    return Math.hypot(from.x - point.x, from.y - point.y) <= limit;
  });
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function bracketSegments(quad: readonly Point[], fraction: number): Segment[] {
  const legs: Segment[] = [];
  if (quad.length < 4 || fraction <= 0) {
    return legs;
  }
  const reach = Math.min(fraction, 0.5);
  for (let index = 0; index < 4; index++) {
    const corner = quad[index];
    pushLeg(legs, corner, quad[(index + 1) % 4], reach);
    pushLeg(legs, corner, quad[(index + 3) % 4], reach);
  }
  return legs;
}

function pushLeg(legs: Segment[], corner: Point, neighbour: Point, fraction: number): void {
  const dx = neighbour.x - corner.x;
  const dy = neighbour.y - corner.y;
  if (dx === 0 && dy === 0) {
    return;
  }
  legs.push({
    ax: corner.x,
    ay: corner.y,
    bx: corner.x + dx * fraction,
    by: corner.y + dy * fraction,
  });
}

export const FOCUS_SOFT = 12;
export const FOCUS_SHARP = 80;
export const RETICLE_WIDTH_MIN = 2;
export const RETICLE_WIDTH_MAX = 4;

export function reticleLineWidth(focus: number): number {
  if (!Number.isFinite(focus)) {
    return RETICLE_WIDTH_MIN;
  }
  const ramp = clamp((focus - FOCUS_SOFT) / (FOCUS_SHARP - FOCUS_SOFT), 0, 1);
  return RETICLE_WIDTH_MIN + ramp * (RETICLE_WIDTH_MAX - RETICLE_WIDTH_MIN);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOfQuad(quad: readonly Point[]): Rect {
  const first = quad[0];
  if (!first) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const point of quad) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function ringRadiusFor(width: number, height: number): number {
  return Math.max(0, Math.min(16, width / 6, height / 6));
}

export function roundedRectPerimeter(width: number, height: number, radius: number): number {
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return 2 * (width - 2 * r) + 2 * (height - 2 * r) + 2 * Math.PI * r;
}

export function lockRingFraction(runLength: number, lockRun: number): number {
  if (!Number.isFinite(runLength) || !Number.isFinite(lockRun) || lockRun <= 0) {
    return 0;
  }
  return clamp(runLength / lockRun, 0, 1);
}

/** A one-frame lock run (capture mode) has no progress to show, so it never draws a ring. */
export function shouldDrawLockRing(fraction: number, lockRun: number): boolean {
  return lockRun > 1 && fraction > 0;
}

export function lockRingDash(perimeter: number, fraction: number): [number, number] {
  const filled = Math.max(0, perimeter) * clamp(fraction, 0, 1);
  return [filled, Math.max(0, perimeter)];
}

export function unrotatePoint(
  point: Point,
  rotatedWidth: number,
  rotatedHeight: number,
  turns: number,
): Point {
  if (turns === 1) {
    return { x: point.y, y: rotatedWidth - point.x };
  }
  if (turns === 2) {
    return { x: rotatedWidth - point.x, y: rotatedHeight - point.y };
  }
  if (turns === 3) {
    return { x: rotatedHeight - point.y, y: point.x };
  }
  return point;
}

export interface CoverMapping {
  scale: number;
  offsetX: number;
  offsetY: number;
  frameWidth: number;
  frameHeight: number;
  turns: number;
}

/** The video renders with `object-fit: cover`; the overlay must use the same centre crop. */
export function coverMapping(
  frameWidth: number,
  frameHeight: number,
  turns: number,
  canvasWidth: number,
  canvasHeight: number,
): CoverMapping {
  const displayWidth = turns % 2 === 1 ? frameHeight : frameWidth;
  const displayHeight = turns % 2 === 1 ? frameWidth : frameHeight;
  const scale =
    displayWidth > 0 && displayHeight > 0
      ? Math.max(canvasWidth / displayWidth, canvasHeight / displayHeight)
      : 1;
  return {
    scale,
    offsetX: (canvasWidth - displayWidth * scale) / 2,
    offsetY: (canvasHeight - displayHeight * scale) / 2,
    frameWidth,
    frameHeight,
    turns,
  };
}

export function mapQuad(quad: readonly Point[], mapping: CoverMapping, out: Point[]): void {
  for (const [index, point] of quad.entries()) {
    const slot = out[index];
    if (!slot) {
      continue;
    }
    const display = unrotatePoint(point, mapping.frameWidth, mapping.frameHeight, mapping.turns);
    slot.x = display.x * mapping.scale + mapping.offsetX;
    slot.y = display.y * mapping.scale + mapping.offsetY;
  }
}
