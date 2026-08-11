import type { DeckZone, Printing } from "@openrift/shared";
import { create } from "zustand";

import type { CardViewerItem } from "@/components/card-viewer-types";

/**
 * Where a click landed, when the caller knows more than which printing it was.
 */
export interface SelectionAnchor {
  /**
   * Deck-overview only: which zone instance was clicked, for a card that appears
   * in several zones.
   */
  zone?: DeckZone;
  /**
   * The clicked grid item's id. Copies view renders one tile per physical copy,
   * so several tiles carry the same printing and a printing lookup would always
   * anchor on the first of them instead of the one the user clicked.
   */
  itemId?: string;
}

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
   * Pass `anchor.itemId` wherever one tile per printing isn't guaranteed, and
   * `anchor.zone` on the deck overview, so the lookup lands on the tile the user
   * clicked rather than the card's first one.
   */
  selectCard: (
    printing: Printing,
    items: CardViewerItem[],
    findBy: "card" | "printing",
    anchor?: SelectionAnchor,
  ) => void;
  /**
   * Navigate directly to a known index. Used for prev/next in the detail pane
   * and arrow-key nav. Pass the item's `zone` on the deck overview so the
   * highlight follows the anchor as nav crosses zone boundaries.
   */
  navigateToIndex: (index: number, printing: Printing, zone?: DeckZone) => void;
  /** Switch printing without changing index or open state (e.g. printing picker). */
  setSelectedCard: (printing: Printing) => void;
  /**
   * Re-anchor the selection against a reshaped `items` list. Callers pass the
   * list their grid renders, whenever it changes.
   */
  reconcileSelection: (items: CardViewerItem[]) => void;
  closeDetail: () => void;
}

/**
 * Resolve the grid position a click anchors at.
 * @returns The item's index in `items`, or -1 when it isn't one of them.
 */
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

  // The grid highlights whatever sits at `selectedIndex`, so a list that
  // reshapes under an open detail view (a moved copy leaves the collection, a
  // filter drops rows, a sort reorders them) leaves the highlight and
  // `selectedCard` on two different cards. Rather than freeze one of them, put
  // them back in step: follow the card while it's still listed, and adopt the
  // card that slid into its place once it's gone.
  reconcileSelection: (items) => {
    const { selectedCard, selectedIndex, selectedZone } = get();
    if (selectedCard === null || selectedIndex < 0) {
      return;
    }
    const inZone = (item: CardViewerItem) => selectedZone === null || item.zone === selectedZone;

    // Still anchored on the same card, so nothing moved under the selection.
    // This is also what leaves the printing picker alone: it swaps in a sibling
    // that may have no tile of its own, and the anchor stays put.
    const anchored = items[selectedIndex];
    if (anchored && inZone(anchored) && anchored.printing.cardId === selectedCard.cardId) {
      return;
    }

    // Still listed, just somewhere else — follow the card rather than hand the
    // selection to whoever took its old position.
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
    // Gone from the list. Take whatever the grid now highlights in its place —
    // the card that moved up into the gap, or the new last one when the card
    // that left was at the end.
    const index = Math.min(selectedIndex, items.length - 1);
    const item = items[index];
    set({ selectedCard: item.printing, selectedIndex: index, selectedZone: item.zone ?? null });
  },

  closeDetail: () =>
    set({ selectedCard: null, selectedIndex: -1, selectedZone: null, detailOpen: false }),
}));
