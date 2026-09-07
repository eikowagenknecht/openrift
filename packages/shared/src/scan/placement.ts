/**
 * Detects when a new card lands in the guide, from thumbnail motion alone: the
 * prior "guide went empty" signal (see `rearmLockedTracks`) misses cards dealt
 * onto a pile. Free of OpenCV and the encoder, so it can run on every camera
 * frame, faster than the recognition pipeline samples.
 */

import { boundingBox } from "./geometry";
import { downscaleGray } from "./image";
import type { GrayImage, Quad } from "./types";

export const PLACEMENT_SIGNATURE_WIDTH = 16;
export const PLACEMENT_SIGNATURE_HEIGHT = 22;

export interface PlacementOptions {
  movingDelta: number;
  settleFrames: number;
  minDisturbedFrames: number;
  minChangedDelta: number;
}

export const DEFAULT_PLACEMENT_OPTIONS: PlacementOptions = {
  movingDelta: 6,
  settleFrames: 2,
  minDisturbedFrames: 3,
  minChangedDelta: 4,
};

export interface PlacementSignal {
  delta: number;
  disturbed: boolean;
  placed: boolean;
  settled: boolean;
  disturbedFrames: number;
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
  /** `guide` is in frame coordinates; pass null to watch the whole frame. */
  observe: (gray: GrayImage, guide: Quad | null) => PlacementSignal;
  reset: () => void;
}

/**
 * Mean-subtracted so a phone's auto-exposure re-metering, a global brightness
 * step, doesn't itself read as motion; only the spatial pattern is kept.
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
    out[i] = (small.data[i] ?? 0) - mean;
  }
  return out;
}

export function signatureDelta(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum / a.length;
}

export function createPlacementDetector(
  options: Partial<PlacementOptions> = {},
): PlacementDetector {
  const opts = { ...DEFAULT_PLACEMENT_OPTIONS, ...options };
  let previous: Float32Array | null = null;
  // View from before the current disturbance began: a settle compares
  // against this, not the previous frame, which is mid-swap.
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
        // Keep the reference fresh so slow drift never accumulates into a
        // fake placement the next time something moves.
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
