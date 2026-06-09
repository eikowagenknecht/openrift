/** Scoring scheme. v1 always uses `standard`; the reduced scheme is reserved. */
export type ScoringScheme = "standard" | "three_pod_reduced";

/**
 * Base points per placement slot, before tie averaging. Index `i` is the points
 * for the (i+1)-th finishing slot. The reduced scheme only changes the 3-pod
 * table; 4-pods score the same under both schemes.
 */
const BASE_POINTS: Record<ScoringScheme, Record<3 | 4, readonly number[]>> = {
  standard: {
    4: [3, 2, 1, 0],
    3: [3, 2, 1],
  },
  three_pod_reduced: {
    4: [3, 2, 1, 0],
    3: [3, 1.5, 0],
  },
};

/**
 * Derive points for each player from their entered placements within one pod.
 *
 * Placements are read by ORDER, not by the literal number entered: group the
 * players by their entered placement value, sort the groups ascending, hand each
 * group the next consecutive slot(s), and average the base points within a tied
 * group. A gap in the entered numbers never skips a points slot.
 *
 * Examples (4-pod, standard): `[1, 2, 2, 4]` and `[1, 3, 3, 4]` both read as
 * "1st / two tied across the 2nd-3rd slots / 4th" and score `[3, 1.5, 1.5, 0]`;
 * `[2, 2, 2, 2]` (all tied) scores `[1.5, 1.5, 1.5, 1.5]`.
 *
 * @param placements The entered placement value per player, in player order.
 * @param podSize The pod size (3 or 4).
 * @param scheme The scoring scheme; defaults to `standard`.
 * @returns Points per player, in the same order as `placements`.
 */
export function pointsForPlacements(
  placements: number[],
  podSize: 3 | 4,
  scheme: ScoringScheme = "standard",
): number[] {
  const base = BASE_POINTS[scheme][podSize];
  const distinctValues = [...new Set(placements)].toSorted((a, b) => a - b);
  const pointsByValue = new Map<number, number>();
  let slot = 0;
  for (const value of distinctValues) {
    const count = placements.filter((placement) => placement === value).length;
    let sum = 0;
    for (let offset = 0; offset < count; offset++) {
      sum += base[slot + offset] ?? 0;
    }
    pointsByValue.set(value, sum / count);
    slot += count;
  }
  return placements.map((placement) => pointsByValue.get(placement) ?? 0);
}
