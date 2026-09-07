/**
 * An artwork already in the collection may be added again only once the guide
 * goes properly empty, or a different card is added in between; neither can
 * be faked by a shaky hand. The identify button bypasses this guard entirely.
 */

export const RELOCK_EMPTY_GUIDE_MS = 1500;

export interface RelockGuard {
  observe: (cardInGuide: boolean, now: number) => void;
  allows: (artKey: string) => boolean;
  note: (artKey: string, now: number) => void;
  reset: () => void;
}

export function createRelockGuard(emptyGuideMs = RELOCK_EMPTY_GUIDE_MS): RelockGuard {
  let added = new Map<string, number>();
  let last: { artKey: string; at: number } | null = null;
  /** Null while a card sits in the guide. */
  let emptySince: number | null = null;
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
      if (emptiedAt > at) {
        return true;
      }
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
