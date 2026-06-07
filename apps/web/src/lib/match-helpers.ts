import { mathRandom } from "@openrift/shared";
import type { PackRandom as Random } from "@openrift/shared";

/**
 * Pick a random id from a list. Accepts an injectable RNG so tests can be
 * deterministic.
 * @returns A random id, or null when the list is empty.
 */
export function chooseRandomId(ids: string[], random: Random = mathRandom): string | null {
  if (ids.length === 0) {
    return null;
  }
  const index = Math.min(ids.length - 1, Math.floor(random.next() * ids.length));
  return ids[index] ?? null;
}

/** How many full passes the spotlight makes over the roster before landing. */
const SPOTLIGHT_LOOPS = 3;

/**
 * Build the ordered list of ids the "who goes first?" spotlight flashes
 * through. It cycles over the roster in order for a few loops and is
 * guaranteed to end on `winnerId`, so the visible reveal matches the
 * committed pick.
 * @returns The flash sequence, ending on `winnerId` (empty if no ids).
 */
export function buildSpotlightSequence(
  ids: string[],
  winnerId: string,
  loops = SPOTLIGHT_LOOPS,
): string[] {
  if (ids.length === 0) {
    return [];
  }
  const winnerIndex = Math.max(0, ids.indexOf(winnerId));
  const totalSteps = ids.length * loops + winnerIndex + 1;
  return Array.from({ length: totalSteps }, (_, step) => ids[step % ids.length] ?? winnerId);
}

const MIN_SPOTLIGHT_DELAY_MS = 60;
const MAX_SPOTLIGHT_DELAY_MS = 320;

/**
 * Ease-out dwell time for a spotlight step: the flash starts fast and slows
 * down as it approaches the final reveal.
 * @returns Milliseconds to hold the given step before advancing.
 */
export function spotlightStepDelay(step: number, total: number): number {
  if (total <= 1) {
    return MAX_SPOTLIGHT_DELAY_MS;
  }
  const progress = step / (total - 1);
  const eased = progress * progress;
  return Math.round(
    MIN_SPOTLIGHT_DELAY_MS + (MAX_SPOTLIGHT_DELAY_MS - MIN_SPOTLIGHT_DELAY_MS) * eased,
  );
}
