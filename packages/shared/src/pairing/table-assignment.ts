import type { Pod } from "./types.js";

/**
 * Assign each pod its table number for a round, honoring fixed seats where
 * possible. Fixed seats are soft: they never influence who plays whom (the
 * pairing engine does not see them), they only steer which physical table a
 * pod lands on once the pods are formed.
 *
 * Rules, processing pods in the order the engine produced them:
 *
 * - A pod containing fixed-seat players claims the lowest of their fixed
 *   tables that is still free. When two fixed-seat players are paired
 *   together, the lower table therefore wins and the other player moves for
 *   the round (surfaced as a `fixedSeatDisplaced` warning, not resolved here).
 * - All remaining pods fill the free numbers in ascending order, keeping their
 *   relative order. A fixed table beyond the pod count simply leaves a gap —
 *   the numbers refer to physical tables, not to a dense 1..N sequence.
 *
 * @param pods The round's pods, in engine order.
 * @param fixedTables playerId -> fixed table number, for players that have one.
 * @returns One table number per pod, parallel to `pods`.
 */
export function assignTableNumbers(
  pods: readonly Pod[],
  fixedTables: ReadonlyMap<string, number>,
): number[] {
  const claimed = new Set<number>();
  const numbers = Array.from({ length: pods.length }, () => 0);
  const unclaimed: number[] = [];

  pods.forEach((pod, index) => {
    const wanted = pod.playerIds
      .map((playerId) => fixedTables.get(playerId))
      .filter((table): table is number => table !== undefined)
      .toSorted((a, b) => a - b);
    const free = wanted.find((table) => !claimed.has(table));
    if (free === undefined) {
      unclaimed.push(index);
      return;
    }
    claimed.add(free);
    numbers[index] = free;
  });

  let next = 1;
  for (const index of unclaimed) {
    while (claimed.has(next)) {
      next += 1;
    }
    claimed.add(next);
    numbers[index] = next;
  }
  return numbers;
}
