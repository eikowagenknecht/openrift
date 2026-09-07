import { DEFAULT_SESSION_OPTIONS } from "@openrift/shared/scan/session";

const INLIER_WEIGHT = 0.55;
const RUN_WEIGHT = 1 - INLIER_WEIGHT;

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function ghostConfidence(
  bestInliers: number,
  lockProgress: { runLength: number; lockRun: number },
): number {
  const inlierPart = unit(bestInliers / DEFAULT_SESSION_OPTIONS.minInliers);
  const runPart =
    lockProgress.lockRun > 1 ? unit(lockProgress.runLength / lockProgress.lockRun) : 0;
  return unit(INLIER_WEIGHT * inlierPart + RUN_WEIGHT * runPart);
}
