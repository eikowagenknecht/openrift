/**
 * Callers pass the values they actually plot: raw snapshots normalize
 * differently per marketplace, and re-deriving from them drifted the badge
 * and chart apart.
 */
export function percentChange(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const first = values[0];
  // oxlint-disable-next-line no-non-null-assertion -- length >= 2 is checked above
  const last = values.at(-1)!;
  if (first === 0) {
    return 0;
  }
  return Math.round(((last - first) / first) * 100);
}
