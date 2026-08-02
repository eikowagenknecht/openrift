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
  GUIDE_MATCH_PX,
  RETICLE_COLORS,
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
  quadsWithin,
  reticleLineWidth,
  ringRadiusFor,
  roundedRectPerimeter,
  shouldDrawLockRing,
  smoothQuadToward,
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
  /**
   * What the brackets are actually aiming at, in rotated-frame pixels: the
   * detector's quads averaged over the last few processed frames, which is
   * where per-frame detector noise gets taken out. Only moves when a processed
   * frame lands, never on a repaint.
   */
  smoothed: Point[];
  /** False until the first quad lands, when {@link OverlayDrawState.smoothed}
   * takes it whole rather than easing toward it from nowhere. */
  smoothing: boolean;
  /** The last real detection, kept so a dropout holds the outline in place
   * instead of snapping the brackets out to the guide. */
  held: Point[];
  /** Whether {@link OverlayDrawState.held} holds anything yet. */
  holding: boolean;
  /** A detection that jumped away from the drawn outline, waiting for a second
   * frame to agree with it before the reticle follows. */
  proposed: Point[];
  /** Whether {@link OverlayDrawState.proposed} is waiting on confirmation. */
  pending: boolean;
  /** Processed frames since the last real detection; past
   * {@link RETICLE_HOLD_FRAMES} the hold is released. */
  missed: number;
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

/**
 * The detection this processed frame contributes to the reticle, if any.
 *
 * Two frames are rejected here. The guide fallback the session substitutes
 * when no proposal overlaps the guide is not a detection — it is the guide,
 * and {@link GUIDE_MATCH_PX} is how the painter tells the two apart. And a
 * proposal that lands far from the outline already drawn is held back until a
 * second frame agrees with it, which is what keeps the brackets off the card's
 * printed inner frame; see {@link RETICLE_JUMP_FRACTION}.
 *
 * @returns The quad to follow, in rotated-frame pixels, or null.
 */
function detectionFrom(target: OverlayTarget, state: OverlayDrawState): readonly Point[] | null {
  const quad =
    target.quad && !(target.guide && quadsWithin(target.quad, target.guide, GUIDE_MATCH_PX))
      ? target.quad
      : null;
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

/**
 * Pick the quad the brackets should aim at this processed frame and fold it
 * into the smoothed one, in rotated-frame pixels.
 *
 * The three sources, in order: a detection, the last one for a few frames
 * after the detector loses it, and the guide rect once that hold runs out.
 *
 * @returns Nothing; the smoothed quad is moved, and `smoothing` says whether
 *   it holds anything the painter should draw.
 */
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
  const source = detected ?? (state.holding ? state.held : target.guide);
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
  const previous = state.painted;
  // Nothing moved and nothing new landed: what is on the canvas is already
  // right, so the cheapest frame is the one that does not paint.
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
  // The smoothed and held quads are in frame pixels, so a rotation adopted
  // mid-run (or a camera that renegotiates its resolution) makes both of them
  // mean something else. Start over rather than easing across the change.
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

  // Where the brackets aim only ever changes when a processed frame lands; a
  // repaint in between just glides the drawn corners toward it.
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
