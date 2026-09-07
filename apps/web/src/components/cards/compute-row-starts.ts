import type { VRow } from "./card-grid-types";

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
