import type { Pod } from "./types.js";

/**
 * Fixed seats never influence who plays whom; they only steer table placement.
 * When two fixed-seat players are paired together, the lower table wins and the
 * other player moves (surfaced elsewhere as a `fixedSeatDisplaced` warning).
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
