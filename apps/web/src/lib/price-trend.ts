/**
 * Callers pass the values they actually plot: raw snapshots normalize
 * differently per marketplace, and re-deriving from them drifted the badge
 * and chart apart.
 */
export function percentChange(values: number[]): number {
  const first = values[0];
  const last = values.at(-1);
  if (values.length < 2 || first === undefined || last === undefined || first === 0) {
    return 0;
  }
  return Math.round(((last - first) / first) * 100);
}
