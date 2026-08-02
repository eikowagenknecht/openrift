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
  /**
   * Score a run by how good its frames were, not just how many there were.
   * A frame at 60 inliers against a rival at 8 is not the same evidence as
   * one at 12 against 8, but a plain frame count treats them alike, so the
   * clean card pays the same three-frame wait as the marginal one. With this
   * on, a frame can count for up to {@link MAX_FRAME_WEIGHT}, so a card the
   * matcher is sure about locks in two frames while a marginal one still
   * needs the full run. Never lets a single frame lock: consecutive
   * agreement is what keeps a lucky accident from counting.
   */
  weighted?: boolean;
  /**
   * A locked artwork may lock again only after {@link rearmLockedTracks}, not
   * merely because its winning frames paused long enough to start a new run.
   *
   * Without this the number of copies counted is a function of how fast the
   * device happens to run. `maxGapFrames` is counted in processed frames, and
   * a phone processes 5-15 a second where the bench clips deliver 30, so the
   * same physical swap falls inside the gap on one device and outside it on
   * another: measured on `3d-print-scanner`, the same footage counted 7 of 12
   * cards at full frame rate and 13 of 12 at a simulated 8 fps. Tying the
   * re-lock to the placement detector instead makes the count depend on what
   * the camera saw rather than on how much of it we managed to process.
   *
   * Only sound where something actually produces that signal, which today
   * means guide mode (a placement detector, plus the absent-frame path). Pan
   * sessions leave it off and keep the calibrated run-gap behaviour.
   */
  relockOnlyAfterRearm?: boolean;
}

/** Most a single frame can count toward a run. */
export const MAX_FRAME_WEIGHT = 2;
/**
 * Inliers, as a multiple of the floor, at which a frame counts double.
 *
 * The scale is deliberately anchored at the floor rather than at zero: a frame
 * sitting exactly on the 11-inlier floor is the weakest evidence the layer
 * accepts at all, so it must weigh exactly 1 and buy no shortcut. Real phone
 * frames on a well-aimed card carry 30-90 inliers (2026-07-31 session log),
 * three to eight times the floor, while the marginal ones that stretch a lock
 * out sit at 11-20. Full credit at 3x separates those populations.
 */
const FULL_WEIGHT_INLIER_MULTIPLE = 3;
/** Rival margin, as a multiple of the required one, at which a frame counts double. */
const FULL_WEIGHT_MARGIN_MULTIPLE = 3;

/**
 * How far past a floor a value sits, as a fraction of the way to full credit.
 *
 * @returns 0 at the floor, 1 at `fullMultiple` times it.
 */
function strengthAbove(value: number, floor: number, fullMultiple: number): number {
  if (floor <= 0 || fullMultiple <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(1, (value / floor - 1) / (fullMultiple - 1)));
}

/**
 * How much one winning frame counts toward its run.
 *
 * Both halves have to be convincing: plenty of inliers means the card really
 * is there, and a wide gap to the best rival artwork means it is that card and
 * not its neighbour. The weaker of the two decides, so a frame swimming in
 * inliers that its runner-up nearly matches counts as the marginal frame it is.
 *
 * @returns A weight between 1 and {@link MAX_FRAME_WEIGHT}.
 */
export function frameWeight(winner: FrameWinner, minInliers: number, margin: number): number {
  const inlierStrength = strengthAbove(winner.inliers, minInliers, FULL_WEIGHT_INLIER_MULTIPLE);
  // Unopposed frames get full credit on this half: no rival artwork verified
  // at all is the widest separation there is.
  const marginStrength =
    winner.rivalInliers === 0
      ? 1
      : strengthAbove(winner.inliers / winner.rivalInliers, margin, FULL_WEIGHT_MARGIN_MULTIPLE);
  return 1 + (MAX_FRAME_WEIGHT - 1) * Math.min(inlierStrength, marginStrength);
}

export interface ArtTrack {
  artKey: string;
  /** Printing key of the first win, for labelling. */
  key: string;
  label: string;
  firstSeen: number;
  sightings: number;
  runLength: number;
  /**
   * The current run's accumulated evidence (see {@link frameWeight}). Equal
   * to `runLength` when the accept options are unweighted.
   */
  runWeight: number;
  /**
   * This run already produced its lock. One lock per run is what makes a
   * second copy of the same card countable: the run has to end, and a new one
   * begin, before the artwork can lock again.
   */
  lockedThisRun: boolean;
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
 * `weight` is what this frame counts for, from {@link frameWeight} when the
 * options are weighted and 1 otherwise. The session computes it because the
 * inlier floor and rival margin are its settings, not the accept layer's.
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
  // One lock per run: holding the locked card keeps extending the same run
  // without re-firing, while looking away and aiming at a second copy (or the
  // placement detector re-arming the track) starts a fresh run that locks
  // again. A session can therefore lock the same artwork several times, one
  // lock per physical copy scanned.
  //
  // Weighted runs still need two frames. A run's first frame can weigh at most
  // MAX_FRAME_WEIGHT, which is below every lock run in use, so nothing locks
  // on a single frame that was not asked to (capture mode passes lockRun 1
  // deliberately, one deliberate tap being its own evidence).
  if (!track.lockedThisRun && track.runWeight >= options.lockRun) {
    track.lockedThisRun = true;
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
      track.runWeight = 0;
      track.lockedThisRun = false;
      track.lastFrame = Number.NEGATIVE_INFINITY;
    }
  }
}
