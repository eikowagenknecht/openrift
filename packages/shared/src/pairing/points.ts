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

/**
 * Derive match points for a Swiss 1v1 match (a 2-player pod) from its entered
 * placements. Unlike the FFA placement tables, Swiss points are win/draw
 * configured per tournament: the sole first place earns `winPoints`, a tie
 * earns both players `drawPoints`, and the loser earns 0.
 *
 * @param placements The entered placement value per player, in player order (length 2).
 * @param winPoints Points for winning the match.
 * @param drawPoints Points each player earns on a draw.
 * @returns Points per player, in the same order as `placements`.
 */
export function swissPointsForPlacements(
  placements: number[],
  winPoints: number,
  drawPoints: number,
): number[] {
  if (placements.length !== 2) {
    throw new Error(`swissPointsForPlacements: expected 2 placements, got ${placements.length}`);
  }
  if (placements[0] === placements[1]) {
    return [drawPoints, drawPoints];
  }
  return placements[0] < placements[1] ? [winPoints, 0] : [0, winPoints];
}

/**
 * Derive each player's placement from the raw game points they ended a pod on.
 *
 * Higher points finish ahead, so the standard competition ranking applies: a
 * player's place is `1 + (how many players scored strictly more)`, which makes
 * equal points share a place and the next group skip the tied slots. The result
 * feeds {@link pointsForPlacements} directly (it reads placements by order, so
 * the skipped values never lose a points slot).
 *
 * Examples (read left to right in player order): `[8, 5, 5, 2]` -> `[1, 2, 2, 4]`;
 * `[8, 8, 3, 3]` -> `[1, 1, 3, 3]`; `[6, 6, 6]` -> `[1, 1, 1]`.
 *
 * @param gamePoints The raw game points per player, in player order.
 * @returns The 1-based placement per player, in the same order as `gamePoints`.
 */
export function placementsFromGamePoints(gamePoints: number[]): number[] {
  return gamePoints.map((points) => 1 + gamePoints.filter((other) => other > points).length);
}
