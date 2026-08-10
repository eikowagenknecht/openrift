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

/**
 * How the user likes to read their deck list. The filters used to live here
 * too; they moved into the URL (`useDeckListFilters`) so a filtered list is
 * linkable, which left this store holding display preferences alone.
 */
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
 * The deck list's sort/group choice, typed to this surface's vocabulary.
 *
 * The values themselves live in the shared per-surface view-prefs store (which
 * validates them against the surface's allowed sets), so this hook is just the
 * typed window onto the "decks" entry.
 *
 * @returns The deck list's sort/group values and their setters.
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
