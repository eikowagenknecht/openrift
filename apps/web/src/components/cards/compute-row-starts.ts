import type { VRow } from "./card-grid-types";

/**
 * Builds a prefix-sum array of Y-offsets so `rowStarts[i]` is the pixel
 * position where row `i` begins in the virtual scroll container. Shared by the
 * grid and table layouts; each passes its own per-row height estimator and the
 * gap between rows (the grid uses `GAP` from card-grid-constants, the table 0).
 *
 * @returns Cumulative start offsets (one per row).
 */
export function computeRowStarts(
  virtualRows: VRow[],
  estimateRowHeight: (index: number) => number,
  gap: number,
): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < virtualRows.length; i++) {
    starts.push(acc);
    acc += estimateRowHeight(i) + gap;
  }
  return starts;
}
