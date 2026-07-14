import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How the deck overview renders its zones: the thumbnail dashboard or a dense list. */
export type DeckOverviewDisplayMode = "grid" | "list";

/**
 * Card ordering inside each zone (and each type group of a grouped zone) when
 * the overview is in list mode. "default" keeps the sidebar's curve order
 * (energy → power → name); the rest reorder within the group.
 */
export type DeckOverviewSort = "default" | "name" | "energy" | "price" | "rarity" | "ownership";

interface DeckOverviewViewState {
  /** Thumbnail dashboard vs the dense text list. */
  displayMode: DeckOverviewDisplayMode;
  setDisplayMode: (displayMode: DeckOverviewDisplayMode) => void;
  /** Card ordering inside each zone/type group. Only applies in list mode. */
  sortBy: DeckOverviewSort;
  setSortBy: (sortBy: DeckOverviewSort) => void;
  /** Direction for `sortBy`. Ignored when `sortBy` is "default". */
  sortDir: "asc" | "desc";
  setSortDir: (sortDir: "asc" | "desc") => void;
}

const DISPLAY_MODES: ReadonlySet<DeckOverviewDisplayMode> = new Set(["grid", "list"]);

const SORTS: ReadonlySet<DeckOverviewSort> = new Set([
  "default",
  "name",
  "energy",
  "price",
  "rarity",
  "ownership",
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
 * Persisted, device-local view preferences for the deck overview: the
 * grid/list display mode and the list-mode card ordering. Kept separate from
 * the global card-browser `displayStore` (whose grid/table mode drives the
 * zone card browser) so switching the overview to a list doesn't change how
 * /cards and /collections look, and vice versa.
 */
export const useDeckOverviewViewStore = create<DeckOverviewViewState>()(
  persist(
    (set) => ({
      displayMode: "grid",
      setDisplayMode: (displayMode) => set({ displayMode }),
      sortBy: "default",
      setSortBy: (sortBy) => set({ sortBy }),
      sortDir: "asc",
      setSortDir: (sortDir) => set({ sortDir }),
    }),
    {
      name: "deck-overview-view",
      // Validate on rehydrate: a hand-edited or stale blob must fall back to
      // defaults per field, never load junk view state.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") {
          return current;
        }
        const raw = persisted as Record<string, unknown>;
        return {
          ...current,
          displayMode: keepAllowed(raw.displayMode, DISPLAY_MODES, current.displayMode),
          sortBy: keepAllowed(raw.sortBy, SORTS, current.sortBy),
          sortDir: raw.sortDir === "desc" ? "desc" : current.sortDir,
        };
      },
    },
  ),
);
