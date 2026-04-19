import type { Printing } from "@openrift/shared";

/** Data attached to every draggable card in the collection grid. */
export interface CardDragData {
  type: "collection-card";
  copyIds: string[];
  /**
   * True when the drag represents a multi-copy stack that should be trimmed to
   * one copy unless Shift is held at drop time. False for unit drags (single
   * copy, or an explicit select-mode selection the user built up by hand).
   */
  isStackDrag: boolean;
  printing: Printing;
  /** Up to 3 unique printings from the dragged cards, for the overlay preview. */
  previewPrintings: Printing[];
  sourceCollectionId: string | undefined;
}
