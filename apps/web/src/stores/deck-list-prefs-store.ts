import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useLocalViewPrefsStore } from "@/stores/view-prefs-store";

export type DeckListSortField = "updated" | "created" | "name" | "value";

export type SortDir = "asc" | "desc";

type DeckListDensity = "grid" | "list";

/**
 * `folder` groups by the user's own folders. Unlike every other axis it is
 * many-to-one: a deck in several folders renders under each of them, so the
 * section counts sum past the deck total.
 */
export type DeckListGroupBy = "none" | "format" | "domains" | "legend" | "validity" | "folder";

const DENSITY_OPTIONS: ReadonlySet<DeckListDensity> = new Set(["grid", "list"]);

interface DeckListPrefsState {
  density: DeckListDensity;
  setDensity: (value: DeckListDensity) => void;
}

const DEFAULTS = {
  density: "grid" as DeckListDensity,
};

export const useDeckListPrefsStore = create<DeckListPrefsState>()(
  persist(
    (set) => ({
      density: DEFAULTS.density,
      setDensity: (value) => set({ density: value }),
    }),
    {
      name: "openrift-deck-list-prefs",
      partialize: (state) => ({ density: state.density }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const density = DENSITY_OPTIONS.has(raw.density as DeckListDensity)
          ? (raw.density as DeckListDensity)
          : current.density;
        // Filter keys from the pre-URL blob are simply ignored — no version
        // bump, so a stale bundle can never discard a newer preference.
        return { ...current, density };
      },
    },
  ),
);

/**
 * The values live in the shared per-surface view-prefs store; this hook is
 * just the typed window onto its "decks" entry.
 */
export function useDeckListViewPrefs() {
  const sortField = useLocalViewPrefsStore((state) => state.decks.sort) as DeckListSortField;
  const sortDir = useLocalViewPrefsStore((state) => state.decks.sortDir);
  const groupBy = useLocalViewPrefsStore((state) => state.decks.groupBy) as DeckListGroupBy;
  const groupDir = useLocalViewPrefsStore((state) => state.decks.groupDir);
  const setSort = useLocalViewPrefsStore((state) => state.setSort);
  const setSortDirection = useLocalViewPrefsStore((state) => state.setSortDir);
  const setGroup = useLocalViewPrefsStore((state) => state.setGroupBy);
  const setGroupDirection = useLocalViewPrefsStore((state) => state.setGroupDir);
  return {
    sortField,
    sortDir,
    groupBy,
    groupDir,
    setSortField: (value: DeckListSortField) => setSort("decks", value),
    setSortDir: (value: SortDir) => setSortDirection("decks", value),
    setGroupBy: (value: DeckListGroupBy) => setGroup("decks", value),
    setGroupDir: (value: SortDir) => setGroupDirection("decks", value),
  };
}
