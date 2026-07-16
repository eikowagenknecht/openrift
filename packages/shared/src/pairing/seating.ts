import { mathRandom } from "../pack-opener/rng.js";
import type { Random } from "../pack-opener/rng.js";

/**
 * Who has sat next to whom across earlier rounds, derived from the stored per-pod
 * seat orders. Both maps count rounds, so a pair that keeps landing together
 * keeps costing more.
 */
export interface SeatingHistory {
  /** Unordered neighbor pairs, keyed by {@link adjacentKey}. */
  adjacent: ReadonlyMap<string, number>;
  /** Directed "b sat directly after a" pairs, keyed by {@link successionKey}. */
  succession: ReadonlyMap<string, number>;
}

/**
 * The unordered-pair key for two neighbors.
 * @returns `"a|b"` with the ids sorted, so both directions map to one key.
 */
export function adjacentKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * The directed key for "b sits directly after a" around the table.
 * @returns `"a>b"`.
 */
export function successionKey(a: string, b: string): string {
  return `${a}>${b}`;
}

/**
 * Fold stored seat orders into a {@link SeatingHistory}. Rows from pods without
 * seat data (rounds persisted before the seating feature) are skipped — they
 * carry no reliable order to count neighbors from.
 *
 * @param rows One row per pod member across the finalized rounds.
 * @returns The accumulated neighbor counts.
 */
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

// All permutations of the given items (n <= 3 in practice, so at most 6).
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  return items.flatMap((item, index) =>
    permutations(items.toSpliced(index, 1)).map((rest) => [item, ...rest]),
  );
}

/**
 * Order a pod's players around the table so nobody repeats last rounds' seating:
 * primarily avoid neighbor pairs that have sat next to each other before, then
 * avoid repeating the exact turn order (the same player directly after the same
 * player), and pick randomly among equally fresh arrangements. The table is
 * circular, so the first player is fixed as an anchor and only the relative
 * order varies — with at most 4 seats that is 6 candidates, scored exhaustively.
 *
 * @param playerIds The pod's members, in any order.
 * @param history Neighbor counts from earlier rounds ({@link foldSeatingHistory}).
 * @param rng Randomness for tie-breaking; inject a seeded one for determinism.
 * @returns The players in seat order (index = seat around the table).
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
    // Lexicographic (adjacent, succession): succession counts are bounded by
    // the adjacent counts, so a small weight keeps them a pure tie-breaker.
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
