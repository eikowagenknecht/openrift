interface CoverBox {
  boxWidth: number;
  boxHeight: number;
  naturalWidth: number;
  naturalHeight: number;
}

export function coverOverflowPx(box: CoverBox): number {
  const { boxWidth, boxHeight, naturalWidth, naturalHeight } = box;
  if (boxWidth <= 0 || boxHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return 0;
  }
  const scale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  return Math.max(0, naturalHeight * scale - boxHeight);
}

export function coverPositionFromDrag(
  startPosition: number,
  deltaY: number,
  overflowPx: number,
): number {
  const moved = overflowPx > 0 ? (deltaY / overflowPx) * 100 : 0;
  return Math.min(100, Math.max(0, Math.round(startPosition - moved)));
}
