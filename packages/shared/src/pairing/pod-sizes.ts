import type { PodSizes } from "./types.js";

/**
 * Only 1, 2, and 5 have no valid split into 3s and 4s (the Frobenius number
 * of {3,4} is 5); every other count >= 3 does.
 */
export function determinePodSizes(playerCount: number): PodSizes | null {
  if (!Number.isInteger(playerCount) || playerCount < 3) {
    return null;
  }
  for (let fours = Math.floor(playerCount / 4); fours >= 0; fours--) {
    const remainder = playerCount - 4 * fours;
    if (remainder % 3 === 0) {
      return { fours, threes: remainder / 3 };
    }
  }
  return null;
}

/** The caller guarantees evenness by handing an odd field a bye before pairing. */
export function determineSwissPodSizes(playerCount: number): PodSizes | null {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount % 2 !== 0) {
    return null;
  }
  return { fours: 0, threes: 0, twos: playerCount / 2 };
}

/** A suggestion only; the organizer decides when to end the tournament. */
export function suggestedRoundCount(playerCount: number): number {
  if (playerCount < 2) {
    return 0;
  }
  return Math.ceil(Math.log2(playerCount));
}
