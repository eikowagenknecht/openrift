/**
 * Counting what the placement watcher saw against what the pipeline named.
 *
 * The watcher knows a card came to rest even when nothing identified it, which
 * makes an uncounted card the one failure the scanner can detect but not fix.
 * The tally turns that into the number behind the tray's "not recognised"
 * line.
 *
 * The line is coaching, not a ledger: it exists to tell the user to slow down
 * while they still remember the card that got away. So a miss count only ever
 * describes the current bad patch, and the next card the scanner names clears
 * it. A stale count would send the user back to cards the scanner had in fact
 * already counted, and adding those a second time is a worse outcome than
 * saying nothing.
 *
 * Pure and clock-injected, so it can be tested without a camera.
 */

/**
 * How long a placement may wait for a lock before it counts as a miss.
 *
 * Real locks land well inside this: 0.5-0.6 s upright on a healthy phone, and
 * 3.2 s was the worst measured case (a low-texture card whose frames hover at
 * the inlier floor, 2026-07-31 session log). Waiting 4 s means a slow lock is
 * never called a miss, at the cost of the warning arriving a beat late, which
 * is the right way round: a wrong "not recognised" line would send the user
 * back to a card that was in fact counted.
 */
export const MISS_GRACE_MS = 4000;

export interface PlacementTally {
  /** A card came to rest in the guide, on the caller's clock. */
  notePlacement: (at: number) => void;
  /**
   * Whether the placement still waiting has now sat past the grace window with
   * nothing named. Says yes exactly once per placement, counting the miss as
   * it does, so the caller can hand that placement's frame to the catch-up
   * queue on the same call.
   *
   * @returns True on the call that turns the waiting placement into a miss.
   */
  takeMiss: (now: number) => boolean;
  /**
   * The scanner named a card. Ends the current bad patch: the misses before it
   * are old news, and the user has already moved on from them.
   */
  noteNamed: () => void;
  /**
   * A second look recovered one earlier miss. Unlike {@link noteNamed} this
   * settles one card rather than ending the patch, because the catch-up pass
   * runs in the quiet *after* a burst: zeroing here would hide the cards of
   * that same burst that no second look could recover.
   */
  noteRecovered: () => void;
  /** Cards seen coming to rest this session. */
  placements: () => number;
  /**
   * Cards missed since the scanner last named one. The tray's coaching line,
   * which is about the patch the user is in right now.
   */
  missedSinceNamed: () => number;
  /**
   * Cards this session never counted, recoveries excluded. The diagnostic
   * number: placements against this is how short a stack session came out.
   */
  missedTotal: () => number;
}

/**
 * Create the placement tally for one scanning session.
 *
 * @returns The tally.
 */
export function createPlacementTally(): PlacementTally {
  let placements = 0;
  let sinceNamed = 0;
  let total = 0;
  // Whether the placement waiting for a name has been settled, either by a
  // lock or by already being counted as a miss. Starts true: nothing has
  // landed yet, so there is nothing outstanding to judge.
  let settled = true;
  let pendingSince = 0;

  return {
    notePlacement(at) {
      placements++;
      settled = false;
      pendingSince = at;
    },
    takeMiss(now) {
      if (settled || now - pendingSince <= MISS_GRACE_MS) {
        return false;
      }
      sinceNamed++;
      total++;
      settled = true;
      return true;
    },
    noteNamed() {
      settled = true;
      sinceNamed = 0;
    },
    noteRecovered() {
      sinceNamed = Math.max(0, sinceNamed - 1);
      total = Math.max(0, total - 1);
    },
    placements() {
      return placements;
    },
    missedSinceNamed() {
      return sinceNamed;
    },
    missedTotal() {
      return total;
    },
  };
}
