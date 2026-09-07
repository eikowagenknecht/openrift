/**
 * `missedSinceNamed` resets to 0 whenever the scanner next names a card; only
 * `missedTotal` accumulates across the whole session.
 */

export const MISS_GRACE_MS = 4000;

export interface PlacementTally {
  notePlacement: (at: number) => void;
  /** Returns true only on the call that turns a waiting placement into a miss. */
  takeMiss: (now: number) => boolean;
  noteNamed: () => void;
  /** Settles one miss without ending the patch, for a catch-up pass after a burst. */
  noteRecovered: () => void;
  placements: () => number;
  missedSinceNamed: () => number;
  missedTotal: () => number;
}

export function createPlacementTally(): PlacementTally {
  let placements = 0;
  let sinceNamed = 0;
  let total = 0;
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
