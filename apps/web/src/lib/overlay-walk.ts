/**
 * Where the stream currently is in the overlay queue, and what stepping either
 * way would push.
 */
export interface OverlayWalk {
  /**
   * 1-based position of the live card in the queue, or `null` when nothing is
   * live or the live card was pushed from outside the queue (a mid-stream
   * search). The readout shows a dash for that case rather than guessing a
   * position the creator never navigated to.
   */
  position: number | null;
  /** How many cards the queue holds. */
  total: number;
  /** Printing id one step back, or `null` at the start. */
  previousPrintingId: string | null;
  /** Printing id one step on, or `null` at the end. */
  nextPrintingId: string | null;
}

/**
 * Derives the walk from the queue and whatever is on screen right now.
 *
 * The live card is looked up by its **first** occurrence: a queue may hold the
 * same printing twice, and without a stored cursor there is nothing to tell the
 * two apart, so the earlier one is the stable answer. Both ends clamp rather
 * than wrap — a show that silently jumps back to card one reads as the app
 * having lost its place.
 *
 * When nothing is live, or the live card came from a search rather than the
 * queue, "next" is the first queue entry: pressing forward starts the run.
 *
 * @returns The position readout and the two step targets.
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
