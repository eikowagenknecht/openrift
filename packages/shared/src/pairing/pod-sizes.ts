import type { PodSizes } from "./types.js";

/**
 * Decompose an active-player count into 4- and 3-player pods, maximizing the
 * number of 4-player pods, then minimizing the number of 3-player pods, never
 * producing a 2- or 5-player pod.
 *
 * `{3, 4}` is a numerical semigroup whose only unrepresentable counts are 1, 2,
 * and 5 (the Frobenius number of {3,4} is 5), so every other count >= 3 has a
 * decomposition. For 1, 2, and 5 there is no valid split and this returns null;
 * the caller surfaces "a round needs at least 3 active players, and 5 cannot be
 * split into 3s and 4s; add or drop a player".
 *
 * @param playerCount The number of active players to seat.
 * @returns The pod-size split, or null for 1, 2, and 5 (no valid decomposition).
 */
export function determinePodSizes(playerCount: number): PodSizes | null {
  if (!Number.isInteger(playerCount) || playerCount < 3) {
    return null;
  }
  // Largest `fours` whose remainder is non-negative and divisible by 3.
  for (let fours = Math.floor(playerCount / 4); fours >= 0; fours--) {
    const remainder = playerCount - 4 * fours;
    if (remainder % 3 === 0) {
      return { fours, threes: remainder / 3 };
    }
  }
  return null;
}

/**
 * Decompose an active-player count into 1v1 Swiss matches (2-player pods). Only
 * even counts >= 2 are representable; the caller guarantees evenness by handing
 * an odd field a bye before pairing.
 *
 * @param playerCount The number of active players to seat.
 * @returns The pod-size split (all twos), or null for odd or non-positive counts.
 */
export function determineSwissPodSizes(playerCount: number): PodSizes | null {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount % 2 !== 0) {
    return null;
  }
  return { fours: 0, threes: 0, twos: playerCount / 2 };
}

/**
 * The Swiss convention for how many rounds to run a field of `playerCount`:
 * `ceil(log2(playerCount))`, enough to separate a clear winner. This is a
 * suggestion only; the organizer decides when to end the tournament.
 *
 * @param playerCount The number of (active) players in the field.
 * @returns The suggested round count (0 for fewer than 2 players).
 */
export function suggestedRoundCount(playerCount: number): number {
  if (playerCount < 2) {
    return 0;
  }
  return Math.ceil(Math.log2(playerCount));
}
