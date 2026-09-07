import { mathRandom } from "../pack-opener/rng.js";
import type { Random } from "../pack-opener/rng.js";

export interface SeatingHistory {
  adjacent: ReadonlyMap<string, number>;
  succession: ReadonlyMap<string, number>;
}

/** Sorts the ids so both directions of a neighbor pair map to one key. */
export function adjacentKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function successionKey(a: string, b: string): string {
  return `${a}>${b}`;
}

/** Rows from pods without seat data (persisted before the seating feature) are skipped. */
export function foldSeatingHistory(
  rows: readonly { podId: string; playerId: string; seat: number | null }[],
): SeatingHistory {
  const adjacent = new Map<string, number>();
  const succession = new Map<string, number>();
  const byPod = Map.groupBy(rows, (row) => row.podId);
  for (const members of byPod.values()) {
    if (members.length < 3 || members.some((member) => member.seat === null)) {
      continue;
    }
    const seated = members
      .toSorted((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
      .map((member) => member.playerId);
    for (let index = 0; index < seated.length; index++) {
      const current = seated[index];
      const next = seated[(index + 1) % seated.length];
      adjacent.set(adjacentKey(current, next), (adjacent.get(adjacentKey(current, next)) ?? 0) + 1);
      succession.set(
        successionKey(current, next),
        (succession.get(successionKey(current, next)) ?? 0) + 1,
      );
    }
  }
  return { adjacent, succession };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  return items.flatMap((item, index) =>
    permutations(items.toSpliced(index, 1)).map((rest) => [item, ...rest]),
  );
}

/**
 * The table is circular, so the first player is fixed as an anchor and only
 * the relative order is scored, exhaustively, against repeat neighbors.
 */
export function arrangeSeating(
  playerIds: readonly string[],
  history: SeatingHistory,
  rng: Random = mathRandom,
): string[] {
  if (playerIds.length < 3) {
    return [...playerIds];
  }
  const [anchor, ...rest] = playerIds;
  let best: string[][] = [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tail of permutations(rest)) {
    const seated = [anchor, ...tail];
    let adjacentRepeats = 0;
    let successionRepeats = 0;
    for (let index = 0; index < seated.length; index++) {
      const current = seated[index];
      const next = seated[(index + 1) % seated.length];
      adjacentRepeats += history.adjacent.get(adjacentKey(current, next)) ?? 0;
      successionRepeats += history.succession.get(successionKey(current, next)) ?? 0;
    }
    // Succession counts are bounded by adjacent counts, so the 1000x weight
    // keeps succession a pure tie-breaker.
    const score = adjacentRepeats * 1000 + successionRepeats;
    if (score < bestScore) {
      bestScore = score;
      best = [seated];
    } else if (score === bestScore) {
      best.push(seated);
    }
  }
  return best[Math.floor(rng.next() * best.length)] ?? [...playerIds];
}
