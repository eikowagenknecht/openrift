/**
 * Geometry and grading for the scanner's camera overlay.
 *
 * The pipeline produces a frame outcome a few times a second, but the reticle
 * is painted every animation frame: everything the paint loop needs has to be
 * a cheap pure function of the last outcome plus the eased state it keeps.
 * That is what lives here — the hook owns the canvas, this file owns the
 * maths, so both are testable without a camera.
 *
 * Coordinates come in three flavours and never mix: quads from the pipeline
 * are in *rotated frame* pixels (the frame the engine processed, after the
 * adopted quarter turns), the video element displays the *unrotated* frame,
 * and the canvas draws in CSS pixels. {@link coverMapping} and
 * {@link mapQuad} are the only bridge between them.
 */

import type { Point } from "@openrift/shared/scan";

import { clamp } from "@/lib/math";

/**
 * The almost-there band of a frame's best inlier count: verification ran but
 * finished just under the 11-inlier accept floor, which on a phone almost
 * always means slight blur or glare — one steadier frame away. The scan page
 * reads the same band for its hold-steady cue, so the reticle and the cue
 * always agree.
 */
export const HOLD_STEADY_MIN_INLIERS = 6;
export const HOLD_STEADY_MAX_INLIERS = 10;

/**
 * Per-frame easing of the drawn corners toward the smoothed quad, as a
 * fraction of the remaining distance. The paint loop runs at display rate and
 * the smoothed quad only moves when a processed frame lands (5-15 times a
 * second), so this is what fills the gap between them: at 0.15 the glide takes
 * roughly 160ms, the same order as the pipeline's own interval, so the
 * brackets are still moving when the next quad arrives instead of arriving
 * early and sitting frozen until it does.
 */
const RETICLE_EASE = 0.15;

/** Sub-pixel remainder that is snapped rather than eased forever. */
const RETICLE_SNAP_PX = 0.5;

/**
 * Per-processed-frame easing of the smoothed quad toward the detector's raw
 * one, in frame pixels.
 *
 * The detector re-derives the outline from scratch every frame — two detectors
 * merged, then whichever proposal embeds closest wins the frame — so
 * consecutive quads on a card lying perfectly still differ by several pixels,
 * and now and then by far more when a different proposal takes the frame.
 * Easing the drawn corners cannot damp that: the paint loop reaches each raw
 * quad well inside one pipeline interval, so every raw quad still gets drawn
 * in full and the reticle swims. The averaging has to happen on the pipeline's
 * own cadence, which is what this does. 0.5 settles in about three processed
 * frames.
 */
const RETICLE_TARGET_EASE = 0.5;

/**
 * How many processed frames the reticle keeps drawing the last real detection
 * after the detector stops finding one.
 *
 * A dropout is usually not the card leaving, it is one blurred or glared
 * frame, and without a hold the brackets snap from the card out to the guide
 * rect and back again a few frames later. That is the largest single jump the
 * overlay can make. Three frames is 200-600ms depending on pipeline rate: long
 * enough to ride out a jiggle, short enough that a card actually taken away
 * releases the reticle promptly.
 */
export const RETICLE_HOLD_FRAMES = 3;

/**
 * How far a detection may sit from the outline already drawn, as a fraction of
 * that outline's diagonal, before a second frame has to agree with it.
 *
 * The detectors do not always propose the card's outer edge: a rectangle fit
 * lands on the printed inner frame about as readily, and which of the two wins
 * is decided by whichever embeds closest, so the two alternate frame to frame
 * on one motionless card. That is a jump of roughly a tenth of the card, back
 * and forth, several times a second, and no amount of averaging hides it —
 * only refusing to follow the second proposal until it proves itself does.
 * Real hand motion clears the bar within a frame or two, so the cost is a
 * frame of lag when the card genuinely moves.
 */
export const RETICLE_JUMP_FRACTION = 0.08;

/**
 * How close a candidate quad has to sit to the guide rect to count as the
 * session's guide fallback rather than as a detection.
 *
 * That fallback rectifies the guide itself when no proposal overlaps it, so
 * its quad is the guide's own corners to the pixel. Counting it as a detection
 * would defeat the hold above — the brackets would jump out to the guide with
 * a candidate still nominally present.
 */
export const GUIDE_MATCH_PX = 0.5;

/** The lock ring fills more slowly than the reticle tracks: it is a progress
 * bar, and a run that breaks should visibly bleed back rather than blink out. */
export const RING_EASE = 0.18;
export const RING_SNAP = 0.004;

/** Length of each bracket leg, as a fraction of the edge it runs along. */
export const BRACKET_FRACTION = 0.18;

/**
 * How the reticle reads the last frame.
 *
 * - `idle` — nothing detected; the brackets sit on the guide rect as a hint.
 * - `seeking` — a card is in frame but verification is nowhere near.
 * - `steady` — verification is inside the hold-steady band; one calm frame away.
 * - `refused` — a candidate cleared the inlier floor but not the rival margin.
 * - `locked` — this frame produced a verified winner.
 */
export type ReticleState = "idle" | "seeking" | "steady" | "refused" | "locked";

/** Reticle colours, keyed by state. Alpha included: the overlay draws over a
 * live camera image, so nothing here is fully opaque. */
export const RETICLE_COLORS: Record<ReticleState, string> = {
  idle: "rgba(255, 255, 255, 0.45)",
  seeking: "rgba(148, 163, 184, 0.9)",
  steady: "rgba(251, 191, 36, 0.95)",
  refused: "rgba(251, 191, 36, 0.95)",
  locked: "rgba(74, 222, 128, 0.95)",
};

/** The full guide outline, deliberately far fainter than the brackets: it says
 * where to put the card, the brackets say what the scanner makes of it. */
export const GUIDE_COLOR = "rgba(255, 255, 255, 0.18)";

export interface ReticleGrade {
  state: ReticleState;
  color: string;
}

export interface ReticleSignals {
  /** A detector proposal was settled on this frame. */
  hasCandidate: boolean;
  /** Best inlier count on the verified shortlist, winner or not. */
  bestInliers: number;
  /** The frame cleared the inlier floor but not the rival margin. */
  refused: boolean;
  /** The frame produced a verified winner. */
  isWinner: boolean;
}

/**
 * Grade one frame into a reticle state and colour.
 *
 * A winner outranks everything; a refusal outranks the inlier bands, because
 * "two cards are fighting" is a different instruction to the user than "hold
 * steady".
 *
 * @returns The state and the colour to stroke the brackets in.
 */
export function gradeReticle(signals: ReticleSignals): ReticleGrade {
  const state = reticleStateFor(signals);
  return { state, color: RETICLE_COLORS[state] };
}

/**
 * The state half of {@link gradeReticle}.
 *
 * @returns The state the signals fall into.
 */
function reticleStateFor(signals: ReticleSignals): ReticleState {
  if (signals.isWinner) {
    return "locked";
  }
  if (signals.refused) {
    return "refused";
  }
  if (!signals.hasCandidate) {
    return "idle";
  }
  if (
    signals.bestInliers >= HOLD_STEADY_MIN_INLIERS &&
    signals.bestInliers <= HOLD_STEADY_MAX_INLIERS
  ) {
    return "steady";
  }
  return "seeking";
}

/**
 * Move one eased value a fraction of the way toward its target.
 *
 * @returns The next value, snapped to the target once within `snap`.
 */
export function stepToward(current: number, target: number, factor: number, snap: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= snap) {
    return target;
  }
  return current + delta * clamp(factor, 0, 1);
}

/**
 * Ease four drawn corners toward the pipeline's latest quad, in place.
 *
 * Mutates rather than returning a new quad on purpose: this runs every
 * animation frame, and the corner objects are allocated once by the caller.
 *
 * @returns True once every corner has arrived, which lets the paint loop stop
 *   repainting an unchanged scene.
 */
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
 * Which cyclic rotation of `quad` lines its corners up with `reference`.
 *
 * The pipeline canonicalises every quad by sorting its corners around the
 * centre and then starting on a short side, and both halves of that can pick a
 * different corner from one frame to the next: the angular sort wraps at half
 * a turn, and the short-side test flips whenever noise makes the two side
 * pairs measure nearly equal. Either flip renumbers the same four corners, and
 * a reticle that eased corner-by-corner would spin the brackets right around
 * the card while the card had not moved at all.
 *
 * @returns The offset in 0..3 to add to a corner index of `quad`, or 0 when
 *   either quad is not a full four corners.
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

/**
 * Ease a smoothed quad toward a freshly detected one, in place, corner by
 * corner under the correspondence {@link quadOffsetTo} found.
 *
 * Runs once per processed frame rather than once per animation frame, so the
 * factor is a per-detection weight and not a per-repaint one.
 *
 * @returns Nothing; `current` is moved toward `target`.
 */
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

/**
 * Copy a quad's corners into a caller-owned array, without allocating.
 *
 * @returns Nothing; `out` is overwritten.
 */
export function copyQuad(quad: readonly Point[], out: Point[]): void {
  for (const [index, point] of out.entries()) {
    const from = quad[index];
    if (from) {
      point.x = from.x;
      point.y = from.y;
    }
  }
}

/**
 * Whether every corner of one quad sits within `px` of its counterpart.
 *
 * @returns True when the quads are the same shape to that tolerance.
 */
export function quadsWithin(a: readonly Point[], b: readonly Point[], px: number): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((point, index) => Math.hypot(point.x - b[index].x, point.y - b[index].y) <= px);
}

/**
 * The longer of a quad's two diagonals, which is the scale everything about it
 * is judged against — a tolerance in raw pixels would mean something different
 * for a card held at arm's length than for one filling the frame.
 *
 * @returns The length in the quad's own units, 0 for an incomplete quad.
 */
export function quadDiagonal(quad: readonly Point[]): number {
  if (quad.length < 4) {
    return 0;
  }
  return Math.max(
    Math.hypot(quad[2].x - quad[0].x, quad[2].y - quad[0].y),
    Math.hypot(quad[3].x - quad[1].x, quad[3].y - quad[1].y),
  );
}

/**
 * Whether a quad sits on top of another, allowing for the corner renumbering
 * {@link quadOffsetTo} undoes and scaling the tolerance to the reference's own
 * size.
 *
 * @returns True when every corner lands within `fraction` of the reference's
 *   diagonal of its counterpart.
 */
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

/** One bracket leg: a straight stroke from a corner along one of its edges. */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/**
 * The eight strokes of a corner-bracket reticle: two per corner, each running
 * `fraction` of the way along one adjacent edge.
 *
 * Legs on a zero-length edge are dropped — a fully degenerate quad returns no
 * segments at all, so a collapsed detection draws nothing instead of four
 * round-capped dots.
 *
 * @returns The strokes, corner by corner, clockwise; at most eight.
 */
export function bracketSegments(quad: readonly Point[], fraction: number): Segment[] {
  const legs: Segment[] = [];
  if (quad.length < 4 || fraction <= 0) {
    return legs;
  }
  // Half an edge per leg is the limit: beyond it the two brackets sharing an
  // edge would overlap, which reads as a full outline again.
  const reach = Math.min(fraction, 0.5);
  for (let index = 0; index < 4; index++) {
    const corner = quad[index];
    pushLeg(legs, corner, quad[(index + 1) % 4], reach);
    pushLeg(legs, corner, quad[(index + 3) % 4], reach);
  }
  return legs;
}

/**
 * Append one leg from `corner` toward `neighbour`, unless the edge is empty.
 *
 * @returns Nothing; the leg is pushed onto `legs`.
 */
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

/** Focus scores (variance of the Laplacian) the width ramp runs between: the
 * session's own blur floor at the bottom, a comfortably sharp aim at the top. */
export const FOCUS_SOFT = 12;
export const FOCUS_SHARP = 80;
export const RETICLE_WIDTH_MIN = 2;
export const RETICLE_WIDTH_MAX = 4;

/**
 * Bracket stroke width for a frame's focus score, so a blurred aim draws
 * thinner and lighter than a sharp one without changing colour.
 *
 * @returns A width between {@link RETICLE_WIDTH_MIN} and
 *   {@link RETICLE_WIDTH_MAX}, clamped at both ends.
 */
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

/**
 * Axis-aligned bounds of a quad. The guide rect maps to an upright rectangle
 * under {@link mapQuad}, so this is exact for it, and the lock ring is only
 * ever traced around the guide.
 *
 * @returns The bounding rectangle; a zero-size rect for an empty quad.
 */
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

/**
 * Corner radius for the lock ring around a guide rect of this size, roughly a
 * card's own corner rounding and never more than the rect can hold.
 *
 * @returns The radius in canvas pixels.
 */
export function ringRadiusFor(width: number, height: number): number {
  return Math.max(0, Math.min(16, width / 6, height / 6));
}

/**
 * Path length once around a rounded rectangle: the four straight runs plus the
 * four quarter-circle corners.
 *
 * @returns The perimeter in canvas pixels, 0 for a rect with no extent.
 */
export function roundedRectPerimeter(width: number, height: number, radius: number): number {
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return 2 * (width - 2 * r) + 2 * (height - 2 * r) + 2 * Math.PI * r;
}

/**
 * How full the lock ring should be for a run of agreeing frames.
 *
 * @returns The fraction in 0..1; 0 when there is no run or no target.
 */
export function lockRingFraction(runLength: number, lockRun: number): number {
  if (!Number.isFinite(runLength) || !Number.isFinite(lockRun) || lockRun <= 0) {
    return 0;
  }
  return clamp(runLength / lockRun, 0, 1);
}

/**
 * Whether the ring is worth drawing at all.
 *
 * A one-frame lock run (capture mode) has no progress to show — it would snap
 * from nothing to a full ring on every tap — so it never draws one.
 *
 * @returns True when the ring should be stroked this frame.
 */
export function shouldDrawLockRing(fraction: number, lockRun: number): boolean {
  return lockRun > 1 && fraction > 0;
}

/**
 * Dash pattern that fills `fraction` of a path of length `perimeter` from its
 * start point, leaving the rest unstroked.
 *
 * @returns The `setLineDash` pair: the drawn run, then a gap long enough to
 *   swallow the remainder of the path.
 */
export function lockRingDash(perimeter: number, fraction: number): [number, number] {
  const filled = Math.max(0, perimeter) * clamp(fraction, 0, 1);
  return [filled, Math.max(0, perimeter)];
}

/**
 * Map a point from rotated-frame coordinates back to the unrotated frame the
 * video element displays.
 *
 * @returns The point in display-frame coordinates.
 */
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

/**
 * The transform from rotated-frame pixels to canvas pixels.
 *
 * The video renders with `object-fit: cover`, so the displayed area is a
 * centre crop of the frame; anything drawn over it has to use the same crop or
 * the reticle drifts off the card.
 *
 * @returns The scale and centring offsets, with the frame geometry they were
 *   derived from.
 */
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

/**
 * Map a quad from rotated-frame pixels into canvas pixels, writing into a
 * caller-owned array so the paint loop allocates nothing.
 *
 * @returns Nothing; `out` is filled with the mapped corners.
 */
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
