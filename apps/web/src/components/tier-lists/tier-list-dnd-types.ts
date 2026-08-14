/**
 * Drag payloads for the tier-list builder. Two sources (a card in the pool, a
 * card already on the board) and three targets (a row, a card inside a row, the
 * pool itself), which between them cover add, move, reorder, and unrank.
 */

/** A card dragged out of the card pool. */
export interface PoolCardDragData {
  type: "tier-pool-card";
  cardId: string;
}

/** A card dragged from a row of the board. */
export interface BoardCardDragData {
  type: "tier-board-card";
  cardId: string;
}

export type TierListDragData = PoolCardDragData | BoardCardDragData;

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
export interface TierPoolDropData {
  type: "tier-pool";
}

export type TierListDropData = TierRowDropData | TierCardDropData | TierPoolDropData;

/** @returns The drag payload carried by an active drag, when it is one of ours. */
export function asTierListDragData(data: unknown): TierListDragData | undefined {
  const candidate = data as TierListDragData | undefined;
  return candidate?.type === "tier-pool-card" || candidate?.type === "tier-board-card"
    ? candidate
    : undefined;
}

/** @returns The drop payload of the hovered target, when it is one of ours. */
export function asTierListDropData(data: unknown): TierListDropData | undefined {
  const candidate = data as TierListDropData | undefined;
  return candidate?.type === "tier-row" ||
    candidate?.type === "tier-card" ||
    candidate?.type === "tier-pool"
    ? candidate
    : undefined;
}
