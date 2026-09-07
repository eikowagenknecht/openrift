/**
 * How long the user has held one artwork at the top of the ranking. A gap
 * longer than {@link AIM_STREAK_GAP_MS} starts the streak over.
 */

export const AIM_STREAK_GAP_MS = 3000;

export interface AimStreaks {
  touch: (artKey: string, now: number) => number;
  take: (artKey: string, now: number) => number | null;
  clear: () => void;
}

export function createAimStreaks(gapMs = AIM_STREAK_GAP_MS): AimStreaks {
  let streaks = new Map<string, { since: number; lastSeen: number }>();

  return {
    touch(artKey, now) {
      const streak = streaks.get(artKey);
      if (!streak || now - streak.lastSeen > gapMs) {
        streaks.set(artKey, { since: now, lastSeen: now });
        return 0;
      }
      streak.lastSeen = now;
      return (now - streak.since) / 1000;
    },
    take(artKey, now) {
      const streak = streaks.get(artKey);
      streaks.delete(artKey);
      return streak === undefined ? null : (now - streak.since) / 1000;
    },
    clear() {
      streaks = new Map();
    },
  };
}
