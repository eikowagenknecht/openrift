import type { Domain } from "@openrift/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DeckListSortField = "updated" | "created" | "name" | "value";

export type SortDir = "asc" | "desc";

export type DeckListDensity = "grid" | "list";

export type DeckListGroupBy = "none" | "format" | "domains" | "legend" | "validity";

export type DeckListFormatFilter = "all" | "constructed" | "freeform";

export type DeckListValidityFilter = "all" | "valid" | "invalid";

const SORT_FIELDS: ReadonlySet<DeckListSortField> = new Set([
  "updated",
  "created",
  "name",
  "value",
]);

const SORT_DIRS: ReadonlySet<SortDir> = new Set(["asc", "desc"]);

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

  // Sort: field + direction (matches the /cards options-bar style)
  sortField: DeckListSortField;
  sortDir: SortDir;
  setSortField: (value: DeckListSortField) => void;
  setSortDir: (value: SortDir) => void;

  density: DeckListDensity;
  setDensity: (value: DeckListDensity) => void;

  // Group: field + direction (controls the order of group headers)
  groupBy: DeckListGroupBy;
  groupDir: SortDir;
  setGroupBy: (value: DeckListGroupBy) => void;
  setGroupDir: (value: SortDir) => void;

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
  sortField: "updated" as DeckListSortField,
  sortDir: "desc" as SortDir,
  density: "grid" as DeckListDensity,
  groupBy: "none" as DeckListGroupBy,
  groupDir: "asc" as SortDir,
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

      sortField: DEFAULTS.sortField,
      sortDir: DEFAULTS.sortDir,
      setSortField: (value) => set({ sortField: value }),
      setSortDir: (value) => set({ sortDir: value }),

      density: DEFAULTS.density,
      setDensity: (value) => set({ density: value }),

      groupBy: DEFAULTS.groupBy,
      groupDir: DEFAULTS.groupDir,
      setGroupBy: (value) => set({ groupBy: value }),
      setGroupDir: (value) => set({ groupDir: value }),

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
        sortField: state.sortField,
        sortDir: state.sortDir,
        density: state.density,
        groupBy: state.groupBy,
        groupDir: state.groupDir,
        formatFilter: state.formatFilter,
        validityFilter: state.validityFilter,
        domainFilter: state.domainFilter,
        showArchived: state.showArchived,
      }),
      merge: (persisted, current) => {
        const raw = (persisted as Record<string, unknown>) ?? {};
        const sortField = SORT_FIELDS.has(raw.sortField as DeckListSortField)
          ? (raw.sortField as DeckListSortField)
          : current.sortField;
        const sortDir = SORT_DIRS.has(raw.sortDir as SortDir)
          ? (raw.sortDir as SortDir)
          : current.sortDir;
        const density = DENSITY_OPTIONS.has(raw.density as DeckListDensity)
          ? (raw.density as DeckListDensity)
          : current.density;
        const groupBy = GROUP_OPTIONS.has(raw.groupBy as DeckListGroupBy)
          ? (raw.groupBy as DeckListGroupBy)
          : current.groupBy;
        const groupDir = SORT_DIRS.has(raw.groupDir as SortDir)
          ? (raw.groupDir as SortDir)
          : current.groupDir;
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
          sortField,
          sortDir,
          density,
          groupBy,
          groupDir,
          formatFilter,
          validityFilter,
          domainFilter,
          showArchived,
        };
      },
    },
  ),
);
