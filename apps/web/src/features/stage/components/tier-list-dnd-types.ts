/**
 * Drag payloads for the tier-list builder. Three sources (a card in the pool, a
 * card already on the board, a whole row by its handle) and three targets (a
 * row, a card inside a row, the pool itself), which between them cover add,
 * move, reorder, unrank, and restacking the ladder.
 */

import { asDragData } from "@/lib/dnd-data";

export interface PoolCardDragData {
  type: "tier-pool-card";
  cardId: string;
  printingId?: string;
}

export interface BoardCardDragData {
  type: "tier-board-card";
  cardId: string;
  printingId?: string;
}

export interface RowHandleDragData {
  type: "tier-row-handle";
  rowIndex: number;
}

export type TierListDragData = PoolCardDragData | BoardCardDragData | RowHandleDragData;

/** Dropping here appends to the end of the row. */
export interface TierRowDropData {
  type: "tier-row";
  rowIndex: number;
}

/** A release over this card inserts before it, ordering the row without a `SortableContext` per row. */
export interface TierCardDropData {
  type: "tier-card";
  cardId: string;
  rowIndex: number;
  position: number;
}

/** Dropping here takes a card off the board. */
interface TierPoolDropData {
  type: "tier-pool";
}

export type TierListDropData = TierRowDropData | TierCardDropData | TierPoolDropData;

const DRAG_TYPES = ["tier-pool-card", "tier-board-card", "tier-row-handle"] as const;
const DROP_TYPES = ["tier-row", "tier-card", "tier-pool"] as const;

export function asTierListDragData(data: unknown): TierListDragData | undefined {
  return asDragData<TierListDragData>(data, DRAG_TYPES);
}

export function asTierListDropData(data: unknown): TierListDropData | undefined {
  return asDragData<TierListDropData>(data, DROP_TYPES);
}
