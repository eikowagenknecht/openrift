/**
 * One card, one add: the guard that keeps a card held in front of the lens
 * from being counted over and over.
 *
 * The engine counts copies from the placement detector, which was calibrated
 * on a phone propped over a mat with cards dealt onto a pile. Handheld it
 * misreads: a wobbling hand looks like a card being laid down, the card drifts
 * half out of the guide for two frames and reads as gone, and either one lets
 * the artwork lock again while the user is still holding the first copy.
 *
 * So in the default mode the count is decided here rather than by the engine.
 * An artwork that already went into the collection may only go in again once
 * something says the physical card in front of the camera has actually
 * changed, and there are exactly two things that say that: the guide going
 * properly empty for a moment, or a different card being added in between.
 * Neither can be faked by a shaky hand. Wanting a second copy of the card
 * still in hand is what the identify button is for, and that path bypasses
 * this guard entirely — the tap IS the user saying "count this one too".
 *
 * Pure and clock-injected, so it can be tested without a camera.
 */

/**
 * How long the guide has to stay empty before the card that just left counts
 * as gone.
 *
 * Long enough that neither a hand drifting off the guide nor a card briefly
 * lost to glare re-arms anything (both are gone for a fraction of a second),
 * short enough that putting a card down and picking the same one up again is
 * never blocked.
 */
export const RELOCK_EMPTY_GUIDE_MS = 1500;

export interface RelockGuard {
  /**
   * Fold in one processed frame: whether anything plausible sat in the guide.
   */
  observe: (cardInGuide: boolean, now: number) => void;
  /**
   * Whether this artwork may be added again. True for anything not added yet.
   */
  allows: (artKey: string) => boolean;
  /** Record an artwork going into the collection, from any path. */
  note: (artKey: string, now: number) => void;
  /** Forget the session, for a new run. */
  reset: () => void;
}

/**
 * Create the re-lock guard for one scanning session.
 *
 * @returns The guard.
 */
export function createRelockGuard(emptyGuideMs = RELOCK_EMPTY_GUIDE_MS): RelockGuard {
  /** When each artwork was last added. */
  let added = new Map<string, number>();
  /** The most recent add of any artwork, for the "a different card came between" rule. */
  let last: { artKey: string; at: number } | null = null;
  /** Start of the current stretch of empty-guide frames, null while a card is in it. */
  let emptySince: number | null = null;
  /** When the guide was last empty for long enough to count as a card change. */
  let emptiedAt = 0;

  return {
    observe(cardInGuide, now) {
      if (cardInGuide) {
        emptySince = null;
        return;
      }
      if (emptySince === null) {
        emptySince = now;
        return;
      }
      if (now - emptySince >= emptyGuideMs) {
        emptiedAt = now;
      }
    },
    allows(artKey) {
      const at = added.get(artKey);
      if (at === undefined) {
        return true;
      }
      // The guide emptied out since, so whatever is in it now was put there
      // afterwards — a second copy, or the same one picked up again.
      if (emptiedAt > at) {
        return true;
      }
      // Another card was added in between, which only happens when a different
      // card was held up. Covers the user who swaps cards faster than the
      // empty-guide window and comes back to an earlier one.
      return last !== null && last.artKey !== artKey;
    },
    note(artKey, now) {
      added.set(artKey, now);
      last = { artKey, at: now };
    },
    reset() {
      added = new Map();
      last = null;
      emptySince = null;
      emptiedAt = 0;
    },
  };
}
