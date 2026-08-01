import { DEFAULT_SESSION_OPTIONS } from "@openrift/shared/scan";

/**
 * Weight of the verification signal in the blended confidence. Inliers move
 * first (they say something on the very first frame that sees the card), so
 * they carry the larger share; the run of agreeing frames is the slower,
 * surer signal that finishes the climb.
 */
const INLIER_WEIGHT = 0.55;
const RUN_WEIGHT = 1 - INLIER_WEIGHT;

/**
 * Clamp to 0-1, treating anything non-finite as 0.
 *
 * @returns The value inside the unit range.
 */
function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * How sure the engine looks right now, on a 0-1 scale, for the converging
 * ghost preview over the camera.
 *
 * This is a presentation number, not a probability: it blends the two signals
 * that visibly climb as a scan comes together. `bestInliers` is measured
 * against the accept layer's own floor
 * ({@link DEFAULT_SESSION_OPTIONS}`.minInliers`), so reaching 1 on that half
 * means "this frame would verify". `runLength` over `lockRun` is the same
 * fraction the overlay's progress ring draws, so the ghost and the ring
 * converge together and the lock never arrives out of nowhere.
 *
 * A run the accept layer has not started yet (`lockRun` 0, or capture mode's
 * single-frame run) contributes nothing rather than jumping to full, so the
 * ghost still fades in on the inlier half alone.
 *
 * @returns The blended confidence, 0-1.
 */
export function ghostConfidence(
  bestInliers: number,
  lockProgress: { runLength: number; lockRun: number },
): number {
  const inlierPart = unit(bestInliers / DEFAULT_SESSION_OPTIONS.minInliers);
  const runPart =
    lockProgress.lockRun > 1 ? unit(lockProgress.runLength / lockProgress.lockRun) : 0;
  return unit(INLIER_WEIGHT * inlierPart + RUN_WEIGHT * runPart);
}
