import type { Card, OverlayBoard, Printing } from "@openrift/shared";

import { resolveTierRows } from "@/components/tier-lists/tier-board";
import type { ResolvedTierRow } from "@/lib/tier-list-presentation";
import { revealedRows, tierRowsToQueue } from "@/lib/tier-list-presentation";

export interface OverlayBoardScene {
  rows: ResolvedTierRow[];
  focusCardId: string | null;
  total: number;
}

/**
 * {@link tierRowsToQueue}'s walk order can differ from board row order: a
 * worst-first run places the bottom row first while still drawing it at the bottom.
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

  return {
    rows: complete ? resolved : revealedRows(resolved, queue, placed),
    focusCardId: complete ? null : (queue[placed - 1]?.printing.cardId ?? null),
    total: queue.length,
  };
}
