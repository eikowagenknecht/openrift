import type { Printing } from "@openrift/shared";
import { create } from "zustand";

interface DragPreviewState {
  /** Up to 3 unique printings from the current selection, in items order. */
  preview: Printing[];
  setPreview: (preview: Printing[]) => void;
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
  setPreview: (preview) => set({ preview }),
}));
