import { mathRandom } from "@openrift/shared";
import type { PackRandom as Random } from "@openrift/shared";

export type CoinSide = "heads" | "tails";

/**
 * Flip a coin. Accepts an injectable RNG so tests can be deterministic.
 * @returns "heads" or "tails".
 */
export function flipCoin(random: Random = mathRandom): CoinSide {
  return random.next() < 0.5 ? "heads" : "tails";
}

/**
 * Roll a single die with the given number of sides (default 6).
 * @returns An integer in the inclusive range [1, sides].
 */
export function rollDie(sides = 6, random: Random = mathRandom): number {
  const safeSides = Math.max(1, Math.floor(sides));
  return Math.min(safeSides, Math.floor(random.next() * safeSides) + 1);
}
