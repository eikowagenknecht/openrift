import type { Printing } from "@openrift/shared";

/** Data attached to every draggable card in the collection grid. */
export interface CardDragData {
  type: "collection-card";
  copyIds: string[];
  printing: Printing;
  /** Up to 3 unique printings from the dragged cards, for the overlay preview. */
  previewPrintings: Printing[];
  sourceCollectionId: string | undefined;
}
