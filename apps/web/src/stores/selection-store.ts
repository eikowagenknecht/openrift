import type { DeckZone, Printing } from "@openrift/shared";
import { create } from "zustand";

import type { CardViewerItem } from "@/lib/card-viewer-types";

/**
 * Where a click landed, when the caller knows more than which printing it was.
 */
interface SelectionAnchor {
  zone?: DeckZone;
  itemId?: string;
}

interface SelectionState {
  selectedCard: Printing | null;
  selectedIndex: number;
  detailOpen: boolean;
  selectedZone: DeckZone | null;

  selectCard: (
    printing: Printing,
    items: CardViewerItem[],
    findBy: "card" | "printing",
    anchor?: SelectionAnchor,
  ) => void;
  navigateToIndex: (index: number, printing: Printing, zone?: DeckZone) => void;
  setSelectedCard: (printing: Printing) => void;
  reconcileSelection: (items: CardViewerItem[]) => void;
  closeDetail: () => void;
}

function findAnchorIndex(
  items: CardViewerItem[],
  printing: Printing,
  findBy: "card" | "printing",
  anchor?: SelectionAnchor,
): number {
  if (anchor?.itemId !== undefined) {
    const byItem = items.findIndex((item) => item.id === anchor.itemId);
    if (byItem !== -1) {
      return byItem;
    }
  }
  if (findBy === "printing") {
    return items.findIndex((item) => item.printing.id === printing.id);
  }
  if (anchor?.zone === undefined) {
    return items.findIndex((item) => item.printing.cardId === printing.cardId);
  }
  return items.findIndex(
    (item) => item.zone === anchor.zone && item.printing.cardId === printing.cardId,
  );
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selectedCard: null,
  selectedIndex: -1,
  detailOpen: false,
  selectedZone: null,

  selectCard: (printing, items, findBy, anchor) => {
    set({
      selectedCard: printing,
      selectedIndex: findAnchorIndex(items, printing, findBy, anchor),
      selectedZone: anchor?.zone ?? null,
      detailOpen: true,
    });
  },

  navigateToIndex: (index, printing, zone) =>
    set({ selectedCard: printing, selectedIndex: index, selectedZone: zone ?? null }),

  setSelectedCard: (printing) => set({ selectedCard: printing }),

  reconcileSelection: (items) => {
    const { selectedCard, selectedIndex, selectedZone } = get();
    if (selectedCard === null || selectedIndex < 0) {
      return;
    }
    const inZone = (item: CardViewerItem) => selectedZone === null || item.zone === selectedZone;

    const anchored = items[selectedIndex];
    if (anchored && inZone(anchored) && anchored.printing.cardId === selectedCard.cardId) {
      return;
    }

    const byPrinting = items.findIndex(
      (item) => inZone(item) && item.printing.id === selectedCard.id,
    );
    const moved =
      byPrinting === -1
        ? items.findIndex((item) => inZone(item) && item.printing.cardId === selectedCard.cardId)
        : byPrinting;
    if (moved !== -1) {
      set({ selectedIndex: moved });
      return;
    }

    if (items.length === 0) {
      set({ selectedCard: null, selectedIndex: -1, selectedZone: null, detailOpen: false });
      return;
    }
    const index = Math.min(selectedIndex, items.length - 1);
    const item = items[index];
    if (!item) {
      return;
    }
    set({ selectedCard: item.printing, selectedIndex: index, selectedZone: item.zone ?? null });
  },

  closeDetail: () =>
    set({ selectedCard: null, selectedIndex: -1, selectedZone: null, detailOpen: false }),
}));
