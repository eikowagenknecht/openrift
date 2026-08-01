/**
 * The accept layer: turn per-frame verification results into locked cards.
 *
 * Three rules, each earned by measurement on the real clips:
 *
 * - **Relative margin, not an absolute bar.** Wrong cards cleared any fixed
 *   inlier threshold whenever a shortlist happened to surface them; what stayed
 *   true is that the correct card out-scores its best different-artwork rival.
 *   A frame only produces a winner when the best candidate beats that rival by
 *   a clear factor, otherwise the frame is refused.
 * - **Consecutive agreement, not lifetime counts.** A card the camera is aimed
 *   at wins run after run; a spurious accept is scattered. Locking needs a run
 *   of agreeing frames with only small gaps, so five accidents spread over a
 *   clip can never lock.
 * - **Artwork level, not printing level.** Printings of one artwork split the
 *   per-key counts (EN and SC halves that never cross a threshold alone), and
 *   no image matcher separates them anyway. Tracks aggregate by artwork;
 *   printing disambiguation is a later, separate stage.
 *
 * Kept free of node and OpenCV imports so it can move into the shared engine
 * unchanged.
 */

export interface VerifiedCandidate {
  key: string;
  /** Artwork identity; printings of one artwork share it. */
  artKey: string;
  inliers: number;
}

export interface FrameWinner {
  key: string;
  artKey: string;
  inliers: number;
  /** Best inliers among candidates of a different artwork, 0 when unopposed. */
  rivalInliers: number;
}

export interface FrameDecision {
  winner: FrameWinner | null;
  /** True when a candidate cleared the floor but not the margin. */
  refused: boolean;
}

/**
 * Decide what, if anything, this frame's verification says.
 *
 * @returns The margin-checked winner, or a refusal marker.
 */
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
  /** Winning frames in a row needed to lock. */
  lockRun: number;
  /** Largest frame gap that still counts as "in a row". */
  maxGapFrames: number;
}

export interface ArtTrack {
  artKey: string;
  /** Printing key of the first win, for labelling. */
  key: string;
  label: string;
  firstSeen: number;
  sightings: number;
  runLength: number;
  lastFrame: number;
  /** Time of the most recent lock; a re-scanned copy locks its artwork again. */
  lockedAt: number | null;
  /**
   * Frames between the start of the run that locked and the lock, a proxy for
   * lock-on latency. Anchored on the current run, not the first sighting ever:
   * a card glimpsed during a pan and locked on a later aim would otherwise
   * report the whole span between the two as its latency.
   */
  framesToLock: number | null;
  firstFrame: number;
  /**
   * True once printing disambiguation confidently picked this track's key;
   * until then sessions keep retrying it on later winner frames.
   */
  printingResolved: boolean;
  /** Frame where the current run of agreeing frames began. */
  runStartFrame: number;
  /** Clip time where the current run began; lock latency is measured from here. */
  runStartSeconds: number;
  /** Longest run ever reached, for diagnosing near-misses. */
  maxRunLength: number;
}

export type AcceptState = Map<string, ArtTrack>;

/**
 * Fold one frame's winner into the tracks.
 *
 * @returns The track if this very frame locked it, otherwise null.
 */
export function observeWinner(
  state: AcceptState,
  frame: number,
  seconds: number,
  winner: FrameWinner,
  label: string,
  options: AcceptOptions,
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
  } else {
    track.runLength = 1;
    track.runStartFrame = frame;
    track.runStartSeconds = seconds;
  }
  track.maxRunLength = Math.max(track.maxRunLength, track.runLength);
  track.lastFrame = frame;
  // Exactly-equals fires once per run: holding the locked card keeps extending
  // the same run without re-firing, while looking away and aiming at a second
  // copy starts a fresh run that locks again. A session can therefore lock the
  // same artwork several times, one lock per physical copy scanned.
  if (track.runLength === options.lockRun) {
    track.lockedAt = seconds;
    track.framesToLock = frame - track.runStartFrame;
    return track;
  }
  return null;
}

/**
 * Break the live runs of already-locked tracks so the next agreeing run can
 * lock again. The session calls this once the guide has visibly lost its card
 * (see the session's absent-frame streak): a second copy of the same printing
 * swapped in faster than the gap tolerance then starts a fresh run instead of
 * silently extending the locked one, so back-to-back copies count twice.
 * Unlocked tracks are left alone — their gap tolerance exists so mid-aim blur
 * does not restart the lock clock, and this must not undo that.
 *
 * @returns Nothing; the affected tracks are reset in place.
 */
export function rearmLockedTracks(state: AcceptState): void {
  for (const track of state.values()) {
    if (track.lockedAt !== null) {
      track.runLength = 0;
      track.lastFrame = Number.NEGATIVE_INFINITY;
    }
  }
}
