/**
 * Placement detection: when did the thing in the guide change?
 *
 * The accept layer decides *what* a card is. It cannot decide *how many*: a
 * second copy dropped onto a stack looks, to every stage downstream of the
 * pixels, exactly like the copy already lying there. Before this module the
 * only "a new card arrived" signal was the guide going empty for two frames
 * (see `rearmLockedTracks`), which never happens when cards are dealt onto a
 * pile, so every copy after the first was folded into the first one's run and
 * silently not counted.
 *
 * This detector answers the counting question from motion alone, with no
 * inference: hold a small contrast-normalised thumbnail of the guide region,
 * call the guide "disturbed" while consecutive thumbnails differ, and report a
 * placement once it settles again. That is cheap enough to run on every camera
 * frame, which is the point: the recognition pipeline runs at a few frames a
 * second, but the answer to "did a card just land" has to be sampled far
 * faster than that or the swap is missed entirely.
 *
 * Free of OpenCV and of the encoder, like the accept layer, so it can run on
 * frames the pipeline never processes.
 */

import { boundingBox } from "./geometry";
import { downscaleGray } from "./image";
import type { GrayImage, Quad } from "./types";

/**
 * Thumbnail width the guide region is reduced to. Small on purpose: at 16x22
 * a card-sized region keeps the layout that distinguishes two artworks while
 * dropping the print detail that would make hand shake read as a swap, and
 * the whole comparison costs a few hundred subtractions.
 */
export const PLACEMENT_SIGNATURE_WIDTH = 16;
/** Thumbnail height, card aspect at {@link PLACEMENT_SIGNATURE_WIDTH}. */
export const PLACEMENT_SIGNATURE_HEIGHT = 22;

export interface PlacementOptions {
  /**
   * Mean absolute thumbnail difference, in grey levels, above which the guide
   * counts as disturbed.
   */
  movingDelta: number;
  /** Still frames after a disturbance before the guide counts as settled. */
  settleFrames: number;
  /**
   * Disturbed frames a settle must have been preceded by to report a
   * placement. One or two frames of difference is hand shake, a lighting
   * flicker or a rolling-shutter wobble; putting a card down takes longer.
   */
  minDisturbedFrames: number;
  /**
   * How far the settled thumbnail must sit from the one before the
   * disturbance for the placement to count as a change of content. A card
   * that was nudged and released settles back onto nearly the same pixels; a
   * card laid on top of it does not.
   */
  minChangedDelta: number;
}

/**
 * Calibrated on `3d-print-scanner` (2026-08-02), the clip of cards dealt onto
 * a pile in a fixed rig. Measured there across 11 real placements and every
 * still stretch between them, see `scripts/scan/probe-placement.ts`.
 */
export const DEFAULT_PLACEMENT_OPTIONS: PlacementOptions = {
  movingDelta: 6,
  settleFrames: 2,
  minDisturbedFrames: 3,
  minChangedDelta: 4,
};

export interface PlacementSignal {
  /** Thumbnail difference from the previous observed frame, in grey levels. */
  delta: number;
  /** The guide is changing right now, so any frame from it is unreliable. */
  disturbed: boolean;
  /**
   * Set on the single frame where a disturbance settles into a new still
   * view that differs from what was there before it. This is the "a card was
   * placed" event.
   */
  placed: boolean;
  /**
   * Set on the frame a disturbance settles, whether or not it changed the
   * content. `placed` implies this.
   */
  settled: boolean;
  /** Frames the disturbance that just settled lasted; 0 unless `settled`. */
  disturbedFrames: number;
  /** Thumbnail distance across the disturbance; 0 unless `settled`. */
  changedDelta: number;
}

const STILL_SIGNAL: PlacementSignal = {
  delta: 0,
  disturbed: false,
  placed: false,
  settled: false,
  disturbedFrames: 0,
  changedDelta: 0,
};

export interface PlacementDetector {
  /**
   * Fold one frame in. `guide` is the region to watch, in frame coordinates;
   * pass null to watch the whole frame.
   */
  observe: (gray: GrayImage, guide: Quad | null) => PlacementSignal;
  /** Forget all history, as if the session had just started. */
  reset: () => void;
}

/**
 * Reduce the guide region of a frame to the comparable thumbnail.
 *
 * Mean-subtracted, because a phone's auto-exposure re-meters constantly and a
 * global brightness step would otherwise read as motion on every frame it
 * happens. Only the spatial pattern is kept.
 *
 * @returns Per-pixel deviations from the region's mean, row-major.
 */
export function placementSignature(gray: GrayImage, guide: Quad | null): Float32Array {
  const box = guide
    ? boundingBox(guide)
    : { minX: 0, minY: 0, maxX: gray.width, maxY: gray.height };
  const left = Math.max(0, Math.floor(box.minX));
  const top = Math.max(0, Math.floor(box.minY));
  const right = Math.min(gray.width, Math.ceil(box.maxX));
  const bottom = Math.min(gray.height, Math.ceil(box.maxY));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  const crop = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (top + y) * gray.width + left;
    crop.set(gray.data.subarray(from, from + width), y * width);
  }
  const small = downscaleGray(
    { data: crop, width, height },
    PLACEMENT_SIGNATURE_WIDTH,
    PLACEMENT_SIGNATURE_HEIGHT,
  );

  let sum = 0;
  for (const value of small.data) {
    sum += value;
  }
  const mean = sum / small.data.length;
  const out = new Float32Array(small.data.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = small.data[i] - mean;
  }
  return out;
}

/**
 * Mean absolute difference between two signatures.
 *
 * @returns The distance in grey levels, or 0 for mismatched lengths.
 */
export function signatureDelta(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}

/**
 * Create a placement detector.
 *
 * @returns The detector; feed it every frame you can afford to look at.
 */
export function createPlacementDetector(
  options: Partial<PlacementOptions> = {},
): PlacementDetector {
  const opts = { ...DEFAULT_PLACEMENT_OPTIONS, ...options };
  let previous: Float32Array | null = null;
  // The last view before the current disturbance began, so a settle can be
  // compared against what was there rather than against the frame before it,
  // which is mid-swap and matches nothing.
  let beforeDisturbance: Float32Array | null = null;
  let disturbedFrames = 0;
  let stillFrames = 0;

  return {
    observe(gray, guide) {
      const current = placementSignature(gray, guide);
      if (!previous) {
        previous = current;
        beforeDisturbance = current;
        return STILL_SIGNAL;
      }
      const delta = signatureDelta(previous, current);
      previous = current;

      if (delta > opts.movingDelta) {
        if (disturbedFrames === 0) {
          stillFrames = 0;
        }
        disturbedFrames++;
        return { ...STILL_SIGNAL, delta, disturbed: true };
      }

      if (disturbedFrames === 0) {
        // Quiet all along: keep the reference fresh so slow drift (the light
        // changing over a long session) never accumulates into a fake
        // placement the next time something does move.
        beforeDisturbance = current;
        return { ...STILL_SIGNAL, delta };
      }

      stillFrames++;
      if (stillFrames < opts.settleFrames) {
        // Settling, not yet settled: still unreliable for recognition.
        return { ...STILL_SIGNAL, delta, disturbed: true };
      }

      const frames = disturbedFrames;
      const changedDelta = beforeDisturbance ? signatureDelta(beforeDisturbance, current) : 0;
      disturbedFrames = 0;
      stillFrames = 0;
      beforeDisturbance = current;
      return {
        delta,
        disturbed: false,
        settled: true,
        placed: frames >= opts.minDisturbedFrames && changedDelta >= opts.minChangedDelta,
        disturbedFrames: frames,
        changedDelta,
      };
    },
    reset() {
      previous = null;
      beforeDisturbance = null;
      disturbedFrames = 0;
      stillFrames = 0;
    },
  };
}
