import type { Card, OverlayBoard, Printing } from "@openrift/shared";

import { resolveTierRows } from "@/components/tier-lists/tier-board";
import type { ResolvedTierRow } from "@/lib/tier-list-presentation";
import { revealedRows, tierRowsToQueue } from "@/lib/tier-list-presentation";

/** A pushed board worked out into what the overlay actually paints. */
export interface OverlayBoardScene {
  /** The rows to draw, holding only what the reveal has placed so far. */
  rows: ResolvedTierRow[];
  /**
   * The card just placed, which the board rings and scrolls to. Null while the
   * reveal has placed nothing and again once it is over — the frame reads that
   * null as "no spotlight", so a finished board is shown whole and undimmed
   * rather than with every tile but one greyed out.
   */
  focusCardId: string | null;
  /**
   * Steps this board has, i.e. how many of its cards the catalogue can draw.
   * The dashboard's `n / total` readout counts against this rather than the
   * stored entry count, so a card pulled from the catalogue doesn't leave a
   * step the reveal can never reach.
   */
  total: number;
}

/**
 * Works a pushed board out into the scene the overlay paints.
 *
 * The stored board is rows in board order plus a position along the walk, and
 * those are different orderings — a worst-first run places the bottom row
 * first while still drawing it at the bottom. So the walk is rebuilt here with
 * {@link tierRowsToQueue} in the pushed direction, and the count is read against
 * that queue before the rows are cut back down to what has landed.
 *
 * Entries whose card is no longer in the catalogue are dropped by
 * {@link resolveTierRows} and never enter the queue, which is what keeps the
 * step count honest.
 *
 * @returns The rows to draw, the card to call out, and the number of steps.
 */
export function deriveOverlayBoardScene(
  board: OverlayBoard,
  cardsById: Record<string, Card>,
  printingsByCardId: Map<string, Printing[]>,
): OverlayBoardScene {
  const resolved = resolveTierRows(board.tiers, cardsById, printingsByCardId);
  const queue = tierRowsToQueue(resolved, board.direction);
  const placed = Math.min(Math.max(board.revealCount, 0), queue.length);
  const complete = placed >= queue.length;

  // The finished board is the resolved rows themselves rather than a fully
  // revealed cut of them: the reveal is over, and there is no reason for a
  // tile whose art failed to resolve to disappear at the last step.
  return {
    rows: complete ? resolved : revealedRows(resolved, queue, placed),
    focusCardId: complete ? null : (queue[placed - 1]?.printing.cardId ?? null),
    total: queue.length,
  };
}
