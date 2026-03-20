import type { Virtualizer } from "@tanstack/react-virtual";

import { IS_COARSE_POINTER } from "@/lib/pointer";

import { APP_HEADER_HEIGHT } from "./card-grid-constants";
import type { SnapPoint, VRow } from "./card-grid-types";

const INDICATOR_PAD = 4;

interface ComputeSnapPointsParams {
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  multipleGroups: boolean;
  indicatorH: number;
}

export function computeSnapPoints({
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  multipleGroups,
  indicatorH,
}: ComputeSnapPointsParams): SnapPoint[] {
  if (!multipleGroups) {
    return [];
  }
  const viewportH = globalThis.innerHeight;
  const totalSize = virtualizer.getTotalSize();
  const contentStart = scrollMargin - APP_HEADER_HEIGHT;
  const contentEnd = scrollMargin + totalSize - viewportH;
  const contentRange = contentEnd - contentStart;
  if (contentRange <= 0) {
    return [];
  }
  const halfH = indicatorH / 2;
  const trackTop = APP_HEADER_HEIGHT + halfH + INDICATOR_PAD;
  const trackBottom = viewportH - halfH - INDICATOR_PAD;

  const measuredStarts = new Map(
    virtualizer.getVirtualItems().map((item) => [item.index, item.start - scrollMargin]),
  );

  const points: SnapPoint[] = [];

  for (let i = 0; i < virtualRows.length; i++) {
    const row = virtualRows[i];
    if (row.kind !== "header") {
      continue;
    }
    const rowStart = measuredStarts.get(i) ?? rowStarts[i];
    const headerScrollY = rowStart + scrollMargin - APP_HEADER_HEIGHT;
    const contentPct = Math.max(0, Math.min(1, (headerScrollY - contentStart) / contentRange));
    const screenY = Math.round(trackTop + contentPct * (trackBottom - trackTop));
    let firstCardId = "";
    for (let j = i + 1; j < virtualRows.length; j++) {
      const next = virtualRows[j];
      if (next.kind === "cards" && next.items.length > 0) {
        firstCardId = next.items[0].shortCode;
        break;
      }
      if (next.kind === "header") {
        break;
      }
    }
    points.push({
      rowIndex: i,
      setInfo: row.set,
      screenY,
      cardCount: row.cardCount,
      firstCardId,
    });
  }

  // Collision avoidance: push badges apart when they overlap vertically.
  const MIN_GAP = IS_COARSE_POINTER ? 32 : 26;
  for (let p = 1; p < points.length; p++) {
    const gap = points[p].screenY - points[p - 1].screenY;
    if (gap < MIN_GAP) {
      points[p].screenY = points[p - 1].screenY + MIN_GAP;
    }
  }

  return points;
}
