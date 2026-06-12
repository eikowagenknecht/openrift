import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Card-line ordering inside each zone of the checker grid. */
export type DeckCheckSort = "deck" | "id" | "name";

interface DeckCheckViewState {
  /** Wide checker grid (full viewport width) vs the page's content width. */
  wide: boolean;
  setWide: (wide: boolean) => void;
  /** How card lines are ordered within a zone. "deck" keeps the import order. */
  sortBy: DeckCheckSort;
  setSortBy: (sortBy: DeckCheckSort) => void;
  /** Direction for `sortBy`. Ignored when `sortBy` is "deck". */
  sortDir: "asc" | "desc";
  setSortDir: (sortDir: "asc" | "desc") => void;
  /** Cards-per-row override for the checker grid; `null` is auto (responsive). */
  maxColumns: number | null;
  setMaxColumns: (maxColumns: number | null) => void;
}

/**
 * Persisted view preferences for the deck-check checker: wide/narrow layout,
 * card-line sort, and the cards-per-row override. Kept separate from the global
 * card-browser `displayStore` so sizing the checker for a physical deck check
 * doesn't change how /cards and /collections look (and vice versa).
 */
export const useDeckCheckViewStore = create<DeckCheckViewState>()(
  persist(
    (set) => ({
      wide: true,
      setWide: (wide) => set({ wide }),
      sortBy: "deck",
      setSortBy: (sortBy) => set({ sortBy }),
      sortDir: "asc",
      setSortDir: (sortDir) => set({ sortDir }),
      maxColumns: null,
      setMaxColumns: (maxColumns) => set({ maxColumns }),
    }),
    {
      name: "deck-check-view",
    },
  ),
);
