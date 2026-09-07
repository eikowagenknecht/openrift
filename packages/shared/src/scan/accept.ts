/**
 * The accept layer: turn per-frame verification results into locked cards.
 *
 * Kept free of node and OpenCV imports so it can move into the shared engine
 * unchanged.
 */

export interface VerifiedCandidate {
  key: string;
  artKey: string;
  inliers: number;
}

export interface FrameWinner {
  key: string;
  artKey: string;
  inliers: number;
  rivalInliers: number;
}

export interface FrameDecision {
  winner: FrameWinner | null;
  refused: boolean;
}

export function pickFrameWinner(
  candidates: readonly VerifiedCandidate[],
  minInliers: number,
  margin: number,
): FrameDecision {
  let best: VerifiedCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.inliers > best.inliers) {
      best = candidate;
    }
  }
  if (!best || best.inliers < minInliers) {
    return { winner: null, refused: false };
  }
  let rivalInliers = 0;
  for (const candidate of candidates) {
    if (candidate.artKey !== best.artKey && candidate.inliers > rivalInliers) {
      rivalInliers = candidate.inliers;
    }
  }
  if (best.inliers < margin * rivalInliers) {
    return { winner: null, refused: true };
  }
  return {
    winner: { key: best.key, artKey: best.artKey, inliers: best.inliers, rivalInliers },
    refused: false,
  };
}

export interface AcceptOptions {
  lockRun: number;
  maxGapFrames: number;
  weighted?: boolean;
  relockOnlyAfterRearm?: boolean;
}

export const MAX_FRAME_WEIGHT = 2;
const FULL_WEIGHT_INLIER_MULTIPLE = 3;
const FULL_WEIGHT_MARGIN_MULTIPLE = 3;

function strengthAbove(value: number, floor: number, fullMultiple: number): number {
  if (floor <= 0 || fullMultiple <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value / floor - 1) / (fullMultiple - 1)));
}

export function frameWeight(winner: FrameWinner, minInliers: number, margin: number): number {
  const inlierStrength = strengthAbove(winner.inliers, minInliers, FULL_WEIGHT_INLIER_MULTIPLE);
  const marginStrength =
    winner.rivalInliers === 0
      ? 1
      : strengthAbove(winner.inliers / winner.rivalInliers, margin, FULL_WEIGHT_MARGIN_MULTIPLE);
  return 1 + (MAX_FRAME_WEIGHT - 1) * Math.min(inlierStrength, marginStrength);
}

export interface ArtTrack {
  artKey: string;
  key: string;
  label: string;
  firstSeen: number;
  sightings: number;
  runLength: number;
  runWeight: number;
  lockedThisRun: boolean;
  lastFrame: number;
  lockedAt: number | null;
  framesToLock: number | null;
  firstFrame: number;
  printingResolved: boolean;
  runStartFrame: number;
  runStartSeconds: number;
  maxRunLength: number;
}

export type AcceptState = Map<string, ArtTrack>;

export function observeWinner(
  state: AcceptState,
  frame: number,
  seconds: number,
  winner: FrameWinner,
  label: string,
  options: AcceptOptions,
  weight = 1,
): ArtTrack | null {
  let track = state.get(winner.artKey);
  if (!track) {
    track = {
      artKey: winner.artKey,
      key: winner.key,
      label,
      firstSeen: seconds,
      sightings: 0,
      runLength: 0,
      runWeight: 0,
      lockedThisRun: false,
      lastFrame: Number.NEGATIVE_INFINITY,
      lockedAt: null,
      framesToLock: null,
      printingResolved: false,
      firstFrame: frame,
      runStartFrame: frame,
      runStartSeconds: seconds,
      maxRunLength: 0,
    };
    state.set(winner.artKey, track);
  }
  track.sightings++;
  if (frame - track.lastFrame <= options.maxGapFrames) {
    track.runLength++;
    track.runWeight += weight;
  } else {
    track.runLength = 1;
    track.runWeight = weight;
    track.runStartFrame = frame;
    track.runStartSeconds = seconds;
    if (!options.relockOnlyAfterRearm) {
      track.lockedThisRun = false;
    }
  }
  track.maxRunLength = Math.max(track.maxRunLength, track.runLength);
  track.lastFrame = frame;
  // A run's first frame weighs at most MAX_FRAME_WEIGHT, below every lockRun
  // in use, so a single frame never locks unless lockRun is 1 (capture mode).
  if (!track.lockedThisRun && track.runWeight >= options.lockRun) {
    track.lockedThisRun = true;
    track.lockedAt = seconds;
    track.framesToLock = frame - track.runStartFrame;
    return track;
  }
  return null;
}

// Unlocked tracks are left alone: their gap tolerance exists so mid-aim blur
// does not restart the lock clock, and this must not undo that.
export function rearmLockedTracks(state: AcceptState): void {
  for (const track of state.values()) {
    if (track.lockedAt !== null) {
      track.runLength = 0;
      track.runWeight = 0;
      track.lockedThisRun = false;
      track.lastFrame = Number.NEGATIVE_INFINITY;
    }
  }
}
