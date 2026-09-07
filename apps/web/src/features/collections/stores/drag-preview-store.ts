import type { Printing } from "@openrift/shared/types/catalog";
import { create } from "zustand";

interface DragPreviewState {
  preview: Printing[];
  selectionCount: number;
  selectionNoun: string;
  setPreview: (preview: Printing[], selectionCount: number, selectionNoun: string) => void;
}

// Cells read the preview with a stable selector, so a +/- click that doesn't
// change selection leaves the reference identical and skips re-rendering all cells.
export const useDragPreviewStore = create<DragPreviewState>()((set) => ({
  preview: [],
  selectionCount: 0,
  selectionNoun: "printing",
  setPreview: (preview, selectionCount, selectionNoun) =>
    set({ preview, selectionCount, selectionNoun }),
}));
