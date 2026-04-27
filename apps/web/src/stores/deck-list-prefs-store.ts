import type { Domain } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DeckListSort =
  | "updated-desc"
  | "created-desc"
  | "name-asc"
  | "name-desc"
  | "value-desc";

export type DeckListDensity = "grid" | "list";

export type DeckListGroupBy = "none" | "format" | "domains" | "legend" | "validity";

export type DeckListFormatFilter = "all" | "constructed" | "freeform";

export type DeckListValidityFilter = "all" | "valid" | "invalid";

const SORT_OPTIONS: ReadonlySet<DeckListSort> = new Set([
  "updated-desc",
  "created-desc",
  "name-asc",
  "name-desc",
  "value-desc",
]);

const GROUP_OPTIONS: ReadonlySet<DeckListGroupBy> = new Set([
  "none",
  "format",
  "domains",
  "legend",
  "validity",
]);

const FORMAT_OPTIONS: ReadonlySet<DeckListFormatFilter> = new Set([
  "all",
  "constructed",
  "freeform",
]);

const VALIDITY_OPTIONS: ReadonlySet<DeckListValidityFilter> = new Set(["all", "valid", "invalid"]);

const DENSITY_OPTIONS: ReadonlySet<DeckListDensity> = new Set(["grid", "list"]);

interface DeckListPrefsState {
  // Transient — not persisted (resets per visit, like a typeahead)
  search: string;
  setSearch: (value: string) => void;

  // Persisted preferences
  sort: DeckListSort;
  setSort: (value: DeckListSort) => void;

  density: DeckListDensity;
  setDensity: (value: DeckListDensity) => void;

  groupBy: DeckListGroupBy;
  setGroupBy: (value: DeckListGroupBy) => void;

  formatFilter: DeckListFormatFilter;
  setFormatFilter: (value: DeckListFormatFilter) => void;

  validityFilter: DeckListValidityFilter;
  setValidityFilter: (value: DeckListValidityFilter) => void;

  /** Domains the deck must contain (intersection — all selected must be present). Empty = no filter. */
  domainFilter: Domain[];
  toggleDomainFilter: (domain: Domain) => void;
  clearDomainFilter: () => void;

  showArchived: boolean;
  setShowArchived: (value: boolean) => void;

  resetFilters: () => void;
}

const DEFAULTS = {
  sort: "updated-desc" as DeckListSort,
  density: "grid" as DeckListDensity,
  groupBy: "none" as DeckListGroupBy,
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

      sort: DEFAULTS.sort,
      setSort: (value) => set({ sort: value }),

      density: DEFAULTS.density,
      setDensity: (value) => set({ density: value }),

      groupBy: DEFAULTS.groupBy,
      setGroupBy: (value) => set({ groupBy: value }),

      formatFilter: DEFAULTS.formatFilter,
      setFormatFilter: (value) => set({ formatFilter: value }),

      validityFilter: DEFAULTS.validityFilter,
      setValidityFilter: (value) => set({ validityFilter: value }),

      domainFilter: DEFAULTS.domainFilter,
      toggleDomainFilter: (domain) =>
        set((state) => ({
          domainFilter: state.domainFilter.includes(domain)
            ? state.domainFilter.filter((value) => value !== domain)
            : [...state.domainFilter, domain],
        })),
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
        sort: state.sort,
        density: state.density,
        groupBy: state.groupBy,
        formatFilter: state.formatFilter,
        validityFilter: state.validityFilter,
        domainFilter: state.domainFilter,
        showArchived: state.showArchived,
      }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const sort = SORT_OPTIONS.has(raw.sort as DeckListSort)
          ? (raw.sort as DeckListSort)
          : current.sort;
        const density = DENSITY_OPTIONS.has(raw.density as DeckListDensity)
          ? (raw.density as DeckListDensity)
          : current.density;
        const groupBy = GROUP_OPTIONS.has(raw.groupBy as DeckListGroupBy)
          ? (raw.groupBy as DeckListGroupBy)
          : current.groupBy;
        const formatFilter = FORMAT_OPTIONS.has(raw.formatFilter as DeckListFormatFilter)
          ? (raw.formatFilter as DeckListFormatFilter)
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
          sort,
          density,
          groupBy,
          formatFilter,
          validityFilter,
          domainFilter,
          showArchived,
        };
      },
    },
  ),
);
