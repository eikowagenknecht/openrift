import type { Printing } from "@openrift/shared";
import { create } from "zustand";

interface DragPreviewState {
  /** Up to 3 unique printings from the current selection, in items order. */
  preview: Printing[];
  /**
   * Number of selected tiles spanned by the current selection (distinct
   * printings/cards, or copies in copies view). 0 when nothing is selected.
   * Drives the overlay label and badge for select-mode drags.
   */
  selectionCount: number;
  /** Singular noun for the selected unit: "card" | "printing" | "copy". */
  selectionNoun: string;
  setPreview: (preview: Printing[], selectionCount: number, selectionNoun: string) => void;
}

/**
 * Drag-overlay preview for /collections select-mode drags.
 *
 * The /collections parent walks `items` + `selected` to build the fan (first
 * three unique printings whose copies are selected), then writes the result
 * here. Cells read with a stable selector, so a +/- click — which doesn't
 * change selection — leaves the preview reference identical and avoids
 * re-rendering 200 cells just to keep the drag fan in sync.
 */
export const useDragPreviewStore = create<DragPreviewState>()((set) => ({
  preview: [],
  selectionCount: 0,
  selectionNoun: "printing",
  setPreview: (preview, selectionCount, selectionNoun) =>
    set({ preview, selectionCount, selectionNoun }),
}));
