/**
 * Percent change across a price series, rounded to whole percent.
 *
 * Callers pass the values they actually plot, so the number always agrees with
 * the line beside it — the marketplaces normalize snapshots differently (market
 * price for TCG/CM, Zero-eligible low for CardTrader) and re-deriving it from
 * raw snapshots is how the badge and the chart drifted apart.
 *
 * @param values Plotted values, oldest first, with gaps already removed.
 * @returns The rounded percent change, or 0 when there is nothing to compare.
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
