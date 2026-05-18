import type { DeckZone, Printing } from "@openrift/shared";
import { create } from "zustand";

import type { CardViewerItem } from "@/components/card-viewer-types";

interface SelectionState {
  selectedCard: Printing | null;
  selectedIndex: number;
  detailOpen: boolean;
  /**
   * Deck-overview only: which zone-instance of the selected card is currently
   * anchored. Same card in multiple zones produces multiple thumbs; this
   * disambiguates which one is highlighted and where arrow-nav starts. `null`
   * outside deck overview (catalog, collections, decks-by-zone) where cards
   * only appear once.
   */
  selectedZone: DeckZone | null;

  /**
   * Select a card by finding it in the items list. Used for grid/thumbnail clicks.
   * On the deck overview, pass `zone` so the lookup picks the right zone-instance
   * of a card that appears in multiple zones.
   */
  selectCard: (
    printing: Printing,
    items: CardViewerItem[],
    findBy: "card" | "printing",
    zone?: DeckZone,
  ) => void;
  /**
   * Navigate directly to a known index. Used for prev/next in the detail pane
   * and arrow-key nav. Pass the item's `zone` on the deck overview so the
   * highlight follows the anchor as nav crosses zone boundaries.
   */
  navigateToIndex: (index: number, printing: Printing, zone?: DeckZone) => void;
  /** Switch printing without changing index or open state (e.g. printing picker). */
  setSelectedCard: (printing: Printing) => void;
  closeDetail: () => void;
}

export const useSelectionStore = create<SelectionState>()((set) => ({
  selectedCard: null,
  selectedIndex: -1,
  detailOpen: false,
  selectedZone: null,

  selectCard: (printing, items, findBy, zone) => {
    const index =
      findBy === "card"
        ? zone === undefined
          ? items.findIndex((item) => item.printing.cardId === printing.cardId)
          : items.findIndex(
              (item) => item.zone === zone && item.printing.cardId === printing.cardId,
            )
        : items.findIndex((item) => item.printing.id === printing.id);
    set({
      selectedCard: printing,
      selectedIndex: index,
      selectedZone: zone ?? null,
      detailOpen: true,
    });
  },

  navigateToIndex: (index, printing, zone) =>
    set({ selectedCard: printing, selectedIndex: index, selectedZone: zone ?? null }),

  setSelectedCard: (printing) => set({ selectedCard: printing }),

  closeDetail: () =>
    set({ selectedCard: null, selectedIndex: -1, selectedZone: null, detailOpen: false }),
}));
