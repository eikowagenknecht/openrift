/**
 * Geometry for the deck cover's vertical crop focus — the `object-position`
 * percentage shared by the preview, the hero and the deck tile. Kept pure so
 * the drag interaction in the cover dialog stays testable.
 */

interface CoverBox {
  /** Rendered width of the preview box, in CSS pixels. */
  boxWidth: number;
  /** Rendered height of the preview box, in CSS pixels. */
  boxHeight: number;
  /** Intrinsic width of the art. */
  naturalWidth: number;
  /** Intrinsic height of the art. */
  naturalHeight: number;
}

/**
 * How many pixels of the `object-cover` art are cropped away vertically. This
 * is the full travel of the focus slider, so it converts a drag distance into a
 * percentage. Returns 0 when the art is not yet measurable or nothing overflows.
 * @param box The preview box and the art's intrinsic size.
 * @returns The hidden vertical pixels, never negative.
 */
export function coverOverflowPx(box: CoverBox): number {
  const { boxWidth, boxHeight, naturalWidth, naturalHeight } = box;
  if (boxWidth <= 0 || boxHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return 0;
  }
  const scale = Math.max(boxWidth / naturalWidth, boxHeight / naturalHeight);
  return Math.max(0, naturalHeight * scale - boxHeight);
}

/**
 * The focus percentage after dragging the preview. Dragging down pulls the art
 * down, which reveals more of its top, so the focus moves toward 0. One pixel
 * of drag moves the art by one pixel, matching the cursor.
 * @param startPosition The focus percentage when the drag began.
 * @param deltaY Pixels dragged since then, positive downward.
 * @param overflowPx The croppable travel from {@link coverOverflowPx}.
 * @returns The new focus percentage, rounded and clamped to 0–100.
 */
export function coverPositionFromDrag(
  startPosition: number,
  deltaY: number,
  overflowPx: number,
): number {
  const moved = overflowPx > 0 ? (deltaY / overflowPx) * 100 : 0;
  return Math.min(100, Math.max(0, Math.round(startPosition - moved)));
}
