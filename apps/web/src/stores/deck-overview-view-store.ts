import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DeckOverviewGroup } from "@/lib/deck-card-group";

/**
 * How the deck overview renders its zones: the thumbnail dashboard, a dense
 * list, or overlapping stacks per group.
 */
type DeckOverviewDisplayMode = "grid" | "list" | "stacks";

/**
 * Card ordering inside each zone (and each type group of a grouped zone) when
 * the overview is in list mode. "default" keeps the sidebar's curve order
 * (energy → power → name); the rest reorder within the group.
 */
export type DeckOverviewSort =
  | "default"
  | "id"
  | "name"
  | "energy"
  | "price"
  | "rarity"
  | "ownership";

/**
 * Widest column count a persisted override may carry. Well past what any
 * display produces (the measurement caps itself on card width), so it only
 * exists to keep a hand-edited blob from asking for a thousand columns.
 */
const MAX_PERSISTED_COLUMNS = 24;

interface DeckOverviewViewState {
  /** Thumbnail dashboard vs the dense text list. */
  displayMode: DeckOverviewDisplayMode;
  setDisplayMode: (displayMode: DeckOverviewDisplayMode) => void;
  /**
   * Cards per row in grid mode. `null` follows the measured container the way
   * the card browser's Auto does; a number is the user's own pick, clamped at
   * the call site to what the container can physically fit.
   */
  columns: number | null;
  setColumns: (columns: number | null) => void;
  /** Render deck thumbnails with the printings the viewer owns. */
  preferOwnedPrintings: boolean;
  setPreferOwnedPrintings: (preferOwnedPrintings: boolean) => void;
  /**
   * Render every physical copy as its own card instead of one thumb with a
   * ×N badge — for checking a physical deck against the screen.
   */
  showAllCopies: boolean;
  setShowAllCopies: (showAllCopies: boolean) => void;
  /** Card ordering inside each zone sub-group, in every display mode. */
  sortBy: DeckOverviewSort;
  setSortBy: (sortBy: DeckOverviewSort) => void;
  /** Direction for `sortBy`. Ignored when `sortBy` is "default". */
  sortDir: "asc" | "desc";
  setSortDir: (sortDir: "asc" | "desc") => void;
  /** Sub-grouping axis inside main / sideboard / overflow. */
  groupBy: DeckOverviewGroup;
  setGroupBy: (groupBy: DeckOverviewGroup) => void;
  /** Direction for `groupBy` — flips the group order, not the membership. */
  groupDir: "asc" | "desc";
  setGroupDir: (groupDir: "asc" | "desc") => void;
  /** Whether the deck view's collapsible Stats charts are expanded. */
  statsOpen: boolean;
  setStatsOpen: (statsOpen: boolean) => void;
  /**
   * Whether grid thumbnails carry the collection-status band (green for the
   * printing on screen, blue for another printing of the same card).
   */
  showOwnershipBands: boolean;
  setShowOwnershipBands: (showOwnershipBands: boolean) => void;
  /** Whether grid thumbnails carry a per-card price chip. Off by default. */
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
 * @returns The persisted value when allowed, otherwise the fallback.
 */
function keepAllowed<Value>(raw: unknown, allowed: ReadonlySet<Value>, fallback: Value): Value {
  return allowed.has(raw as Value) ? (raw as Value) : fallback;
}

/**
 * @returns True when a persisted column override is a usable count.
 */
function isColumnCount(raw: unknown): raw is number {
  return (
    typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= MAX_PERSISTED_COLUMNS
  );
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
      columns: null,
      setColumns: (columns) => set({ columns }),
      preferOwnedPrintings: false,
      setPreferOwnedPrintings: (preferOwnedPrintings) => set({ preferOwnedPrintings }),
      showAllCopies: false,
      setShowAllCopies: (showAllCopies) => set({ showAllCopies }),
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
