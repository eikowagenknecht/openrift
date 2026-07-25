import type { Domain } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useLocalViewPrefsStore } from "@/stores/view-prefs-store";

export type DeckListSortField = "updated" | "created" | "name" | "value";

export type SortDir = "asc" | "desc";

type DeckListDensity = "grid" | "list";

export type DeckListGroupBy = "none" | "format" | "domains" | "legend" | "validity";

/**
 * "all" or a deck-format slug from the `deck_formats` reference table. The
 * toolbar validates user-selected values against the live list; the persisted
 * value is accepted as long as it's a plausible slug.
 */
export type DeckListFormatFilter = "all" | string;

export type DeckListValidityFilter = "all" | "valid" | "invalid";

const FORMAT_FILTER_SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

function isValidFormatFilter(value: unknown): value is DeckListFormatFilter {
  return value === "all" || (typeof value === "string" && FORMAT_FILTER_SLUG_RE.test(value));
}

const VALIDITY_OPTIONS: ReadonlySet<DeckListValidityFilter> = new Set(["all", "valid", "invalid"]);

const DENSITY_OPTIONS: ReadonlySet<DeckListDensity> = new Set(["grid", "list"]);

interface DeckListPrefsState {
  // Transient — not persisted (resets per visit, like a typeahead)
  search: string;
  setSearch: (value: string) => void;

  density: DeckListDensity;
  setDensity: (value: DeckListDensity) => void;

  formatFilter: DeckListFormatFilter;
  setFormatFilter: (value: DeckListFormatFilter) => void;

  validityFilter: DeckListValidityFilter;
  setValidityFilter: (value: DeckListValidityFilter) => void;

  /** Domains the deck must contain (intersection — all selected must be present). Empty = no filter. */
  domainFilter: Domain[];
  setDomainFilter: (domains: Domain[]) => void;
  clearDomainFilter: () => void;

  showArchived: boolean;
  setShowArchived: (value: boolean) => void;

  resetFilters: () => void;
}

const DEFAULTS = {
  density: "grid" as DeckListDensity,
  formatFilter: "all" as DeckListFormatFilter,
  validityFilter: "all" as DeckListValidityFilter,
  domainFilter: [] as Domain[],
  showArchived: false,
};

export const useDeckListPrefsStore = create<DeckListPrefsState>()(
  persist(
    (set) => ({
      search: "",
      setSearch: (value) => set({ search: value }),

      density: DEFAULTS.density,
      setDensity: (value) => set({ density: value }),

      formatFilter: DEFAULTS.formatFilter,
      setFormatFilter: (value) => set({ formatFilter: value }),

      validityFilter: DEFAULTS.validityFilter,
      setValidityFilter: (value) => set({ validityFilter: value }),

      domainFilter: DEFAULTS.domainFilter,
      setDomainFilter: (domains) => set({ domainFilter: domains }),
      clearDomainFilter: () => set({ domainFilter: [] }),

      showArchived: DEFAULTS.showArchived,
      setShowArchived: (value) => set({ showArchived: value }),

      resetFilters: () =>
        set({
          search: "",
          formatFilter: DEFAULTS.formatFilter,
          validityFilter: DEFAULTS.validityFilter,
          domainFilter: DEFAULTS.domainFilter,
        }),
    }),
    {
      name: "openrift-deck-list-prefs",
      partialize: (state) => ({
        density: state.density,
        formatFilter: state.formatFilter,
        validityFilter: state.validityFilter,
        domainFilter: state.domainFilter,
        showArchived: state.showArchived,
      }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const density = DENSITY_OPTIONS.has(raw.density as DeckListDensity)
          ? (raw.density as DeckListDensity)
          : current.density;
        const formatFilter = isValidFormatFilter(raw.formatFilter)
          ? raw.formatFilter
          : current.formatFilter;
        const validityFilter = VALIDITY_OPTIONS.has(raw.validityFilter as DeckListValidityFilter)
          ? (raw.validityFilter as DeckListValidityFilter)
          : current.validityFilter;
        const domainFilter = Array.isArray(raw.domainFilter)
          ? (raw.domainFilter.filter((value) => typeof value === "string") as Domain[])
          : current.domainFilter;
        const showArchived =
          typeof raw.showArchived === "boolean" ? raw.showArchived : current.showArchived;
        return {
          ...current,
          density,
          formatFilter,
          validityFilter,
          domainFilter,
          showArchived,
        };
      },
    },
  ),
);

/**
 * The deck list's sort/group choice, typed to this surface's vocabulary.
 *
 * The values themselves live in the shared per-surface view-prefs store (which
 * validates them against the surface's allowed sets), so this hook is just the
 * typed window onto the "decks" entry. Density, filters, and the archived
 * toggle stay in the store above — only sort and grouping moved.
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
