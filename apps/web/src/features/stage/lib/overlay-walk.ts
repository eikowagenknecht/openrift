export interface OverlayWalk {
  /**
   * 1-based, or `null` when nothing is live or the live card was pushed from
   * outside the queue (a mid-stream search).
   */
  position: number | null;
  total: number;
  previousPrintingId: string | null;
  nextPrintingId: string | null;
}

/**
 * A repeated printing in the queue is anchored on its first occurrence, since
 * there is no stored cursor to tell the copies apart. Both ends clamp rather
 * than wrap.
 */
export function deriveOverlayWalk(
  queue: readonly string[],
  livePrintingId: string | null,
): OverlayWalk {
  const total = queue.length;
  const index = livePrintingId === null ? -1 : queue.indexOf(livePrintingId);

  if (index === -1) {
    return {
      position: null,
      total,
      previousPrintingId: null,
      nextPrintingId: queue[0] ?? null,
    };
  }

  return {
    position: index + 1,
    total,
    previousPrintingId: queue[index - 1] ?? null,
    nextPrintingId: queue[index + 1] ?? null,
  };
}
