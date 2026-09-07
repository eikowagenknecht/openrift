import type { Virtualizer } from "@tanstack/react-virtual";

import { IS_COARSE_POINTER } from "@/lib/pointer";

import type { SnapPoint, VRow } from "./card-grid-types";

const INDICATOR_PAD = 4;

interface ComputeSnapPointsParams {
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  multipleGroups: boolean;
  indicatorH: number;
  stickyOffset: number;
}

export function computeSnapPoints({
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  multipleGroups,
  indicatorH,
  stickyOffset,
}: ComputeSnapPointsParams): SnapPoint[] {
  if (!multipleGroups) {
    return [];
  }
  const viewportH = globalThis.innerHeight;
  const totalSize = virtualizer.getTotalSize();
  const contentStart = scrollMargin - stickyOffset;
  const contentEnd = scrollMargin + totalSize - viewportH;
  const contentRange = contentEnd - contentStart;
  if (contentRange <= 0) {
    return [];
  }
  const halfH = indicatorH / 2;
  const trackTop = stickyOffset + halfH + INDICATOR_PAD;
  const trackBottom = viewportH - halfH - INDICATOR_PAD;

  const measuredStarts = new Map(
    virtualizer.getVirtualItems().map((item) => [item.index, item.start - scrollMargin]),
  );

  const points: SnapPoint[] = [];

  for (const [i, row] of virtualRows.entries()) {
    if (row.kind !== "header") {
      continue;
    }
    const rowStart = measuredStarts.get(i) ?? rowStarts[i];
    if (rowStart === undefined) {
      continue;
    }
    const headerScrollY = rowStart + scrollMargin - stickyOffset;
    const contentPct = Math.max(0, Math.min(1, (headerScrollY - contentStart) / contentRange));
    const screenY = Math.round(trackTop + contentPct * (trackBottom - trackTop));
    let firstCardId = "";
    for (const next of virtualRows.slice(i + 1)) {
      if (next.kind === "header") {
        break;
      }
      const first = next.items[0];
      if (first) {
        firstCardId = first.printing.shortCode;
        break;
      }
    }
    points.push({
      rowIndex: i,
      group: row.group,
      screenY,
      cardCount: row.cardCount,
      firstCardId,
    });
  }

  const MIN_GAP = IS_COARSE_POINTER ? 32 : 26;
  let previousY: number | undefined;
  for (const point of points) {
    if (previousY !== undefined && point.screenY - previousY < MIN_GAP) {
      point.screenY = previousY + MIN_GAP;
    }
    previousY = point.screenY;
  }

  return points;
}
