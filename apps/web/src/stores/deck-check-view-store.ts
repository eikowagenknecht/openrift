import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Card-line ordering inside each zone of the checker grid. */
export type DeckCheckSort = "deck" | "id" | "name" | "domain" | "energy";

/** How the checker renders cards: a thumbnail grid or a dense text list. */
export type DeckCheckDisplayMode = "grid" | "list";

interface DeckCheckViewState {
  /** Wide checker grid (full viewport width) vs the page's content width. */
  wide: boolean;
  setWide: (wide: boolean) => void;
  /** Thumbnail grid vs a dense one-row-per-copy text list. */
  displayMode: DeckCheckDisplayMode;
  setDisplayMode: (displayMode: DeckCheckDisplayMode) => void;
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

const DECK_CHECK_SORTS: ReadonlySet<DeckCheckSort> = new Set([
  "deck",
  "id",
  "name",
  "domain",
  "energy",
]);

/**
 * Keeps a persisted value only when it is one of the allowed choices; a
 * corrupt or stale blob falls back to the in-code default.
 * @returns The persisted value when allowed, otherwise the fallback.
 */
function keepAllowed<Value>(raw: unknown, allowed: ReadonlySet<Value>, fallback: Value): Value {
  return allowed.has(raw as Value) ? (raw as Value) : fallback;
}

/**
 * Persisted view preferences for the deck-check checker: wide/narrow layout,
 * grid/list display mode, card-line sort, and the cards-per-row override. Kept
 * separate from the global
 * card-browser `displayStore` so sizing the checker for a physical deck check
 * doesn't change how /cards and /collections look (and vice versa).
 */
export const useDeckCheckViewStore = create<DeckCheckViewState>()(
  persist(
    (set) => ({
      wide: true,
      setWide: (wide) => set({ wide }),
      displayMode: "grid",
      setDisplayMode: (displayMode) => set({ displayMode }),
      sortBy: "deck",
      setSortBy: (sortBy) => set({ sortBy }),
      sortDir: "asc",
      setSortDir: (sortDir) => set({ sortDir }),
      maxColumns: null,
      setMaxColumns: (maxColumns) => set({ maxColumns }),
    }),
    {
      name: "deck-check-view",
      // Validate on rehydrate: a hand-edited or stale blob must fall back to
      // defaults per field, never load junk view state.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") {
          return current;
        }
        const raw = persisted as Record<string, unknown>;
        return {
          ...current,
          wide: typeof raw.wide === "boolean" ? raw.wide : current.wide,
          displayMode: keepAllowed(
            raw.displayMode,
            new Set<DeckCheckDisplayMode>(["grid", "list"]),
            current.displayMode,
          ),
          sortBy: keepAllowed(raw.sortBy, DECK_CHECK_SORTS, current.sortBy),
          sortDir: raw.sortDir === "desc" ? "desc" : current.sortDir,
          maxColumns:
            typeof raw.maxColumns === "number" && raw.maxColumns >= 1
              ? Math.floor(raw.maxColumns)
              : null,
        };
      },
    },
  ),
);
