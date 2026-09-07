/** Scoring scheme. v1 always uses `standard`; the reduced scheme is reserved. */
export type ScoringScheme = "standard" | "three_pod_reduced";

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
 * Placements are read by order, not by the literal value entered: a gap in
 * the entered numbers never skips a points slot.
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

export function swissPointsForPlacements(
  placements: number[],
  winPoints: number,
  drawPoints: number,
): number[] {
  const [first, second] = placements;
  if (placements.length !== 2 || first === undefined || second === undefined) {
    throw new Error(`swissPointsForPlacements: expected 2 placements, got ${placements.length}`);
  }
  if (first === second) {
    return [drawPoints, drawPoints];
  }
  return first < second ? [winPoints, 0] : [0, winPoints];
}

/** Standard competition ranking: equal points share a place and the next group skips the tied slots. */
export function placementsFromGamePoints(gamePoints: number[]): number[] {
  return gamePoints.map((points) => 1 + gamePoints.filter((other) => other > points).length);
}
