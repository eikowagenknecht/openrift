/**
 * Decides whether the compact filter bar's icon clusters (Domain, Rarity) can
 * show their inline labels without pushing the bar onto a second row.
 *
 * The inputs are deliberately independent of the current label state: the
 * non-cluster child widths don't change when labels toggle, and the clusters'
 * expanded widths come from an invisible measuring strip that always renders
 * labels. That independence is what keeps the expanded/collapsed decision
 * from oscillating (collapsing frees space, which would otherwise immediately
 * re-qualify the labels to expand).
 *
 * @returns True when everything fits on one row with the labels shown.
 */
export function clusterLabelsFit({
  containerWidth,
  childWidths,
  expandedClusterWidths,
  gap,
  buffer,
}: {
  /** The bar's content-box width in pixels. */
  containerWidth: number;
  /** Widths of the bar's in-flow children, excluding the clusters themselves. */
  childWidths: readonly number[];
  /** Widths the clusters would occupy with labels and counts shown. */
  expandedClusterWidths: readonly number[];
  /** The bar's column gap in pixels. */
  gap: number;
  /** Extra slack so a bar sitting exactly at the boundary doesn't flicker. */
  buffer: number;
}): boolean {
  const widths = [...childWidths, ...expandedClusterWidths];
  if (widths.length === 0) {
    return true;
  }
  const required =
    widths.reduce((total, width) => total + width, 0) + gap * (widths.length - 1) + buffer;
  return required <= containerWidth;
}
