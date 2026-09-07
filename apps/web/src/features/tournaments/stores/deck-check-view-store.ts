import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DeckCheckSort } from "@/features/tournaments/lib/deck-check-sort";

export type DeckCheckDisplayMode = "grid" | "list";

interface DeckCheckViewState {
  wide: boolean;
  setWide: (wide: boolean) => void;
  displayMode: DeckCheckDisplayMode;
  setDisplayMode: (displayMode: DeckCheckDisplayMode) => void;
  sortBy: DeckCheckSort;
  setSortBy: (sortBy: DeckCheckSort) => void;
  sortDir: "asc" | "desc";
  setSortDir: (sortDir: "asc" | "desc") => void;
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
 */
function keepAllowed<Value>(raw: unknown, allowed: ReadonlySet<Value>, fallback: Value): Value {
  return allowed.has(raw as Value) ? (raw as Value) : fallback;
}

/**
 * Kept separate from the global card-browser `displayStore` so sizing the
 * checker doesn't change how /cards and /collections look.
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
