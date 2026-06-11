import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DeckCheckViewState {
  /** Wide checker grid (full viewport width) vs the page's content width. */
  wide: boolean;
  setWide: (wide: boolean) => void;
}

/**
 * Persisted view preference for the deck-check checker. Desktop only in
 * practice: below the content width the two layouts are identical, so the
 * toggle is hidden there.
 */
export const useDeckCheckViewStore = create<DeckCheckViewState>()(
  persist((set) => ({ wide: true, setWide: (wide) => set({ wide }) }), {
    name: "deck-check-view",
  }),
);
