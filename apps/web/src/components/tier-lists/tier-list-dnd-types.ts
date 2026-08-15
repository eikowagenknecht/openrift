/**
 * Drag payloads for the tier-list builder. Three sources (a card in the pool, a
 * card already on the board, a whole row by its handle) and three targets (a
 * row, a card inside a row, the pool itself), which between them cover add,
 * move, reorder, unrank, and restacking the ladder.
 */

import { asDragData } from "@/lib/dnd-data";

/** A card dragged out of the card pool. */
export interface PoolCardDragData {
  type: "tier-pool-card";
  cardId: string;
  /**
   * The printing the creator grabbed, when the cell stood for one. Carried so
   * ranking from the printings view pins that art on the board. Absent from a
   * cards-view cell, which stands for the card: dragging one of those must not
   * clear a printing the entry is already pinned to.
   */
  printingId?: string;
}

/** A card dragged from a row of the board. */
export interface BoardCardDragData {
  type: "tier-board-card";
  cardId: string;
  /**
   * The printing the tile is rendering — the entry's pinned one, or the default
   * it fell back to — so the drag ghost carries the art the row shows. Read by
   * the overlay only: the drop deliberately does not pass it on, because
   * "keep whatever this card is pinned to" is already what an omitted printing
   * means to `assign`, and forwarding a defaulted id would pin it for real.
   */
  printingId?: string;
}

/** A whole row, dragged by its handle to restack the ladder. */
export interface RowHandleDragData {
  type: "tier-row-handle";
  rowIndex: number;
}

export type TierListDragData = PoolCardDragData | BoardCardDragData | RowHandleDragData;

/** A row's card strip. Dropping here appends to the end of the row. */
export interface TierRowDropData {
  type: "tier-row";
  rowIndex: number;
}

/**
 * A card already on the board, doubling as a drop target so a release over it
 * inserts *before* it. This is what makes ordering within a row possible
 * without a `SortableContext` per row.
 */
export interface TierCardDropData {
  type: "tier-card";
  cardId: string;
  rowIndex: number;
  /** Index of this card in its row, before the dragged card is lifted out. */
  position: number;
}

/** The card pool. Dropping here takes a card off the board. */
interface TierPoolDropData {
  type: "tier-pool";
}

export type TierListDropData = TierRowDropData | TierCardDropData | TierPoolDropData;

const DRAG_TYPES = ["tier-pool-card", "tier-board-card", "tier-row-handle"] as const;
const DROP_TYPES = ["tier-row", "tier-card", "tier-pool"] as const;

/** @returns The drag payload carried by an active drag, when it is one of ours. */
export function asTierListDragData(data: unknown): TierListDragData | undefined {
  return asDragData<TierListDragData>(data, DRAG_TYPES);
}

/** @returns The drop payload of the hovered target, when it is one of ours. */
export function asTierListDropData(data: unknown): TierListDropData | undefined {
  return asDragData<TierListDropData>(data, DROP_TYPES);
}
