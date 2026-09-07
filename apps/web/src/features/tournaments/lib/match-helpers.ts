import { mathRandom } from "@openrift/shared/pack-opener/rng";
import type { Random } from "@openrift/shared/pack-opener/rng";

export function chooseRandomId(ids: string[], random: Random = mathRandom): string | null {
  if (ids.length === 0) {
    return null;
  }
  const index = Math.min(ids.length - 1, Math.floor(random.next() * ids.length));
  return ids[index] ?? null;
}

/** How many full passes the spotlight makes over the roster before landing. */
const SPOTLIGHT_LOOPS = 3;

/** Cycles the roster for a few loops, guaranteed to end on `winnerId`. */
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
