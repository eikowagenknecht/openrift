import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DeckOverviewGroup } from "@/lib/deck-card-group";

export type DeckOverviewDisplayMode = "grid" | "list" | "stacks";

export type DeckOverviewSort =
  | "default"
  | "id"
  | "name"
  | "energy"
  | "price"
  | "rarity"
  | "ownership";

const MAX_PERSISTED_COLUMNS = 24;

interface DeckOverviewViewState {
  displayMode: DeckOverviewDisplayMode;
  setDisplayMode: (displayMode: DeckOverviewDisplayMode) => void;
  columns: number | null;
  setColumns: (columns: number | null) => void;
  preferOwnedPrintings: boolean;
  setPreferOwnedPrintings: (preferOwnedPrintings: boolean) => void;
  showAllCopies: boolean;
  setShowAllCopies: (showAllCopies: boolean) => void;
  showAllRuneCopies: boolean;
  setShowAllRuneCopies: (showAllRuneCopies: boolean) => void;
  sortBy: DeckOverviewSort;
  setSortBy: (sortBy: DeckOverviewSort) => void;
  sortDir: "asc" | "desc";
  setSortDir: (sortDir: "asc" | "desc") => void;
  groupBy: DeckOverviewGroup;
  setGroupBy: (groupBy: DeckOverviewGroup) => void;
  groupDir: "asc" | "desc";
  setGroupDir: (groupDir: "asc" | "desc") => void;
  statsOpen: boolean;
  setStatsOpen: (statsOpen: boolean) => void;
  showOwnershipBands: boolean;
  setShowOwnershipBands: (showOwnershipBands: boolean) => void;
  showPrices: boolean;
  setShowPrices: (showPrices: boolean) => void;
}

const DISPLAY_MODES: ReadonlySet<DeckOverviewDisplayMode> = new Set(["grid", "list", "stacks"]);

const SORTS: ReadonlySet<DeckOverviewSort> = new Set([
  "default",
  "id",
  "name",
  "energy",
  "price",
  "rarity",
  "ownership",
]);

const GROUPS: ReadonlySet<DeckOverviewGroup> = new Set([
  "type",
  "energy",
  "domain",
  "ownership",
  "none",
]);

/**
 * Keeps a persisted value only when it is one of the allowed choices; a
 * corrupt or stale blob falls back to the in-code default.
 */
function keepAllowed<Value>(raw: unknown, allowed: ReadonlySet<Value>, fallback: Value): Value {
  return allowed.has(raw as Value) ? (raw as Value) : fallback;
}

function isColumnCount(raw: unknown): raw is number {
  return (
    typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= MAX_PERSISTED_COLUMNS
  );
}

/**
 * Kept separate from the global card-browser `displayStore` so switching the
 * overview to a list doesn't change how /cards and /collections look.
 */
export const useDeckOverviewViewStore = create<DeckOverviewViewState>()(
  persist(
    (set) => ({
      displayMode: "grid",
      setDisplayMode: (displayMode) => set({ displayMode }),
      columns: null,
      setColumns: (columns) => set({ columns }),
      preferOwnedPrintings: false,
      setPreferOwnedPrintings: (preferOwnedPrintings) => set({ preferOwnedPrintings }),
      showAllCopies: false,
      setShowAllCopies: (showAllCopies) => set({ showAllCopies }),
      showAllRuneCopies: false,
      setShowAllRuneCopies: (showAllRuneCopies) => set({ showAllRuneCopies }),
      sortBy: "default",
      setSortBy: (sortBy) => set({ sortBy }),
      sortDir: "asc",
      setSortDir: (sortDir) => set({ sortDir }),
      groupBy: "type",
      setGroupBy: (groupBy) => set({ groupBy }),
      groupDir: "asc",
      setGroupDir: (groupDir) => set({ groupDir }),
      statsOpen: true,
      setStatsOpen: (statsOpen) => set({ statsOpen }),
      showOwnershipBands: true,
      setShowOwnershipBands: (showOwnershipBands) => set({ showOwnershipBands }),
      showPrices: false,
      setShowPrices: (showPrices) => set({ showPrices }),
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
          // Anything that isn't a usable count — including the `thumbSize` step
          // this replaced — falls back to Auto.
          columns: isColumnCount(raw.columns) ? raw.columns : current.columns,
          preferOwnedPrintings:
            raw.preferOwnedPrintings === true ? true : current.preferOwnedPrintings,
          showAllCopies: raw.showAllCopies === true ? true : current.showAllCopies,
          showAllRuneCopies: raw.showAllRuneCopies === true ? true : current.showAllRuneCopies,
          sortBy: keepAllowed(raw.sortBy, SORTS, current.sortBy),
          sortDir: raw.sortDir === "desc" ? "desc" : current.sortDir,
          groupBy: keepAllowed(raw.groupBy, GROUPS, current.groupBy),
          groupDir: raw.groupDir === "desc" ? "desc" : current.groupDir,
          // Defaults to open, so only an explicit `false` survives rehydrate.
          statsOpen: raw.statsOpen === false ? false : current.statsOpen,
          // Same: bands are on by default, so only an explicit `false` sticks.
          showOwnershipBands: raw.showOwnershipBands === false ? false : current.showOwnershipBands,
          // Prices are off by default, so only an explicit `true` sticks.
          showPrices: raw.showPrices === true ? true : current.showPrices,
        };
      },
    },
  ),
);
