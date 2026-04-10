import type { Printing } from "@openrift/shared";
import { create } from "zustand";

import type { CardViewerItem } from "@/components/card-viewer-types";

interface SelectionState {
  selectedCard: Printing | null;
  selectedIndex: number;
  detailOpen: boolean;

  /** Select a card by finding it in the items list. Used for grid/thumbnail clicks. */
  selectCard: (printing: Printing, items: CardViewerItem[], findBy: "card" | "printing") => void;
  /** Navigate directly to a known index. Used for prev/next in the detail pane. */
  navigateToIndex: (index: number, printing: Printing) => void;
  /** Switch printing without changing index or open state (e.g. printing picker). */
  setSelectedCard: (printing: Printing) => void;
  closeDetail: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedCard: null,
  selectedIndex: -1,
  detailOpen: false,

  selectCard: (printing, items, findBy) => {
    const index =
      findBy === "card"
        ? items.findIndex((item) => item.printing.cardId === printing.cardId)
        : items.findIndex((item) => item.printing.id === printing.id);
    set({ selectedCard: printing, selectedIndex: index, detailOpen: true });
  },

  navigateToIndex: (index, printing) => set({ selectedCard: printing, selectedIndex: index }),

  setSelectedCard: (printing) => set({ selectedCard: printing }),

  closeDetail: () => set({ selectedCard: null, selectedIndex: -1, detailOpen: false }),
}));
