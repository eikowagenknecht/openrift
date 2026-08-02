/**
 * Catch-up recognition: a second look at the cards the live pass missed.
 *
 * The placement detector knows a card came to rest even when nothing
 * identified it, and the reason it went unidentified is almost always that the
 * pipeline had no frame slot free at the moment the card was sharp and still.
 * That compute is not gone, it is just late: a second after the card leaves,
 * the phone is idle again.
 *
 * So every placement keeps its best frame, and a placement that produces no
 * lock hands that frame back to the pipeline once the guide is quiet. A single
 * frame cannot earn a lock the way a run of agreeing frames does, so what
 * comes back is either strong enough to stand alone (see
 * {@link catchUpVerdict}) or it becomes a card the user can identify by
 * tapping, with the picture of what was actually on the mat.
 *
 * Pure and clock-injected, so the queue and the bar can be tested without a
 * camera.
 */
import type { FrameWinner, RgbaImage } from "@openrift/shared/scan";
import { MAX_FRAME_WEIGHT, frameWeight } from "@openrift/shared/scan";

/**
 * Frames held for a second look at once.
 *
 * Each one is a full processing-size RGBA frame (around 1.6 MB at the default
 * 848 px), so this is a memory bound, not a policy: three covers a fast dealer
 * getting several cards ahead of a stuttering pipeline, and a fourth miss
 * pushes the oldest out rather than growing without limit.
 */
export const CATCH_UP_CAPACITY = 3;

export interface CatchUpEntry {
  /** Identifies the entry across the queue, the retry and the tray. */
  id: string;
  /** The frame the placement settled on, for re-recognition. */
  frame: RgbaImage;
  /** A small JPEG data URL of the same moment, for the tray. */
  thumbnail: string | null;
  /** When the placement settled, on the caller's clock. */
  at: number;
}

export interface CatchUpQueue {
  /** Hold a placement's frame for a second look. */
  push: (entry: CatchUpEntry) => void;
  /** Take the oldest entry, or null when there is nothing waiting. */
  take: () => CatchUpEntry | null;
  /** Drop one entry by id, whatever its position. */
  drop: (id: string) => void;
  /** How many frames are waiting. */
  size: () => number;
  /** Forget everything, for a new session. */
  clear: () => void;
}

/**
 * Create a bounded queue of frames waiting for a second look.
 *
 * @returns The queue.
 */
export function createCatchUpQueue(capacity = CATCH_UP_CAPACITY): CatchUpQueue {
  let entries: CatchUpEntry[] = [];
  return {
    push(entry) {
      entries.push(entry);
      // Oldest out: a card three placements ago is the least likely to still
      // be worth chasing, and the user has moved on from it.
      while (entries.length > capacity) {
        entries.shift();
      }
    },
    take() {
      return entries.shift() ?? null;
    },
    drop(id) {
      entries = entries.filter((entry) => entry.id !== id);
    },
    size() {
      return entries.length;
    },
    clear() {
      entries = [];
    },
  };
}

export type CatchUpVerdict = "add" | "ask" | "discard";

/**
 * What to do with a re-recognised frame.
 *
 * A live lock needs several agreeing frames because any one of them can be a
 * fluke. Here there is only ever one frame, so the evidence in it has to carry
 * the whole decision: only a frame at the top of {@link frameWeight}'s scale
 * (well clear of the inlier floor AND well clear of its best rival artwork) is
 * added without asking. Anything that verified at all but weaker becomes a
 * question for the user, with the frame to look at. Nothing verifiable at all
 * is dropped: re-asking about a frame of the mat helps nobody.
 *
 * @returns Whether to add the card, ask the user, or forget the frame.
 */
export function catchUpVerdict(
  winner: FrameWinner | null,
  minInliers: number,
  margin: number,
): CatchUpVerdict {
  if (!winner) {
    return "discard";
  }
  return frameWeight(winner, minInliers, margin) >= MAX_FRAME_WEIGHT ? "add" : "ask";
}

/**
 * Whether the pipeline should spend this frame slot on the catch-up queue.
 *
 * Live scanning always wins: the card in front of the camera now is the one
 * the user is waiting on, and a queued frame has already been missed once, so
 * a moment longer costs nothing. The queue therefore only runs while the guide
 * is quiet, which on a real deal is the gap between one card and the next.
 *
 * @returns True when a queued frame should be re-recognised now.
 */
export function shouldRunCatchUp(input: {
  queued: number;
  /** The guide is changing right now. */
  settling: boolean;
  /** Something in the guide ranked plausibly on the last processed frame. */
  cardInGuide: boolean;
  /** A catch-up frame is already in flight. */
  busy: boolean;
}): boolean {
  return input.queued > 0 && !input.busy && !input.settling && !input.cardInGuide;
}
