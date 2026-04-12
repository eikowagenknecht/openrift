import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
  GroupByField,
  RangeKey,
  Rarity,
  SortDirection,
  SortOption,
  SuperType,
} from "@openrift/shared";
import { parseAsArrayOf, parseAsFloat, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef } from "react";

import { useSearchScopeStore } from "@/stores/search-scope-store";

const filterParsers = {
  search: parseAsString.withDefault(""),
  sets: parseAsArrayOf(parseAsString, ",").withDefault([]),
  rarities: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsString, ",").withDefault([]),
  superTypes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  domains: parseAsArrayOf(parseAsString, ",").withDefault([]),
  artVariants: parseAsArrayOf(parseAsString, ",").withDefault([]),
  finishes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  energyMin: parseAsInteger,
  energyMax: parseAsInteger,
  mightMin: parseAsInteger,
  mightMax: parseAsInteger,
  powerMin: parseAsInteger,
  powerMax: parseAsInteger,
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  owned: parseAsString,
  signed: parseAsString,
  promo: parseAsString,
  banned: parseAsString,
  errata: parseAsString,
  sort: parseAsString.withDefault("id"),
  sortDir: parseAsString.withDefault("asc"),
  view: parseAsString.withDefault("cards"),
  groupBy: parseAsString.withDefault("set"),
  groupDir: parseAsString.withDefault("asc"),
};

type ArrayKey =
  | "sets"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes";

/**
 * Returns the read-only filter, sort, and view state derived from URL query
 * parameters. Components that only need to read (not write) filter state should
 * prefer this hook — it avoids subscribing to the setter functions, which are
 * referentially stable and never cause re-renders on their own.
 * @returns The current filter, sort, and view state.
 */
export function useFilterValues() {
  const [filterState] = useQueryStates(filterParsers, {
    history: "push",
  });
  const searchScope = useSearchScopeStore((s) => s.scope);

  const filters = {
    search: filterState.search,
    searchScope,
    sets: filterState.sets,
    rarities: filterState.rarities as Rarity[],
    types: filterState.types as CardType[],
    superTypes: filterState.superTypes as SuperType[],
    domains: filterState.domains as Domain[],
    artVariants: filterState.artVariants as ArtVariant[],
    finishes: filterState.finishes as Finish[],
    isOwned: filterState.owned === "true" ? true : filterState.owned === "false" ? false : null,
    isSigned: filterState.signed === "true" ? true : filterState.signed === "false" ? false : null,
    isPromo: filterState.promo === "true" ? true : filterState.promo === "false" ? false : null,
    promoTypes: [],
    isBanned: filterState.banned === "true" ? true : filterState.banned === "false" ? false : null,
    hasErrata: filterState.errata === "true" ? true : filterState.errata === "false" ? false : null,
    energy: { min: filterState.energyMin, max: filterState.energyMax },
    might: { min: filterState.mightMin, max: filterState.mightMax },
    power: { min: filterState.powerMin, max: filterState.powerMax },
    price: { min: filterState.priceMin, max: filterState.priceMax },
  };

  const ranges: Record<RangeKey, { min: number | null; max: number | null }> = {
    energy: filters.energy,
    might: filters.might,
    power: filters.power,
    price: filters.price,
  };

  const sortBy = filterState.sort as SortOption;
  const sortDir = filterState.sortDir as SortDirection;
  const view = filterState.view as "cards" | "printings" | "copies";
  const groupBy = filterState.groupBy as GroupByField;
  const groupDir = filterState.groupDir as SortDirection;

  const hasActiveFilters =
    filterState.search !== "" ||
    filterState.sets.length > 0 ||
    filterState.rarities.length > 0 ||
    filterState.types.length > 0 ||
    filterState.superTypes.length > 0 ||
    filterState.domains.length > 0 ||
    filterState.artVariants.length > 0 ||
    filterState.finishes.length > 0 ||
    filterState.energyMin !== null ||
    filterState.energyMax !== null ||
    filterState.mightMin !== null ||
    filterState.mightMax !== null ||
    filterState.powerMin !== null ||
    filterState.powerMax !== null ||
    filterState.priceMin !== null ||
    filterState.priceMax !== null ||
    filterState.owned !== null ||
    filterState.signed !== null ||
    filterState.promo !== null ||
    filterState.banned !== null ||
    filterState.errata !== null;

  return {
    filters,
    ranges,
    sortBy,
    sortDir,
    view,
    groupBy,
    groupDir,
    hasActiveFilters,
    filterState,
    searchScope,
  };
}

/**
 * Returns only the setter / action functions for filter state.
 *
 * NOTE: This hook still subscribes to `filterState` values internally (for
 * `toggleSigned`, `togglePromo`, and the `pendingRef` sync effect), so it
 * will re-render when filter values change. The benefit over `useCardFilters`
 * is that it does not compute derived state (`filters`, `ranges`, etc.).
 *
 * The `pendingRef` / `useEffect` coordination for `toggleArrayFilter` lives
 * here because it is tightly coupled to the setter logic.
 * @returns The filter action functions.
 */
export function useFilterActions() {
  const [filterState, setFilterState] = useQueryStates(filterParsers, {
    history: "push",
  });
  const toggleSearchField = useSearchScopeStore((s) => s.toggleField);
  const selectAllSearchFields = useSearchScopeStore((s) => s.selectAll);
  const selectOnlySearchField = useSearchScopeStore((s) => s.selectOnly);

  // nuqs uses startTransition for history pushes, so filterState may lag behind
  // rapid successive clicks. Track the latest intended array values in a ref so
  // toggleArrayFilter always operates on the most recently written state.
  const pendingRef = useRef<Partial<Record<ArrayKey, string[]>>>({});

  // Clear pending entries once filterState has caught up from the URL.
  useEffect(() => {
    const keys = Object.keys(pendingRef.current) as ArrayKey[];
    for (const key of keys) {
      const pending = pendingRef.current[key];
      if (!pending) {
        continue;
      }
      const synced = filterState[key];
      const pendingSorted = pending.toSorted();
      const syncedSorted = synced.toSorted();
      if (
        pendingSorted.length === syncedSorted.length &&
        pendingSorted.every((v, i) => v === syncedSorted[i])
      ) {
        pendingRef.current[key] = undefined;
      }
    }
  }, [filterState]);

  const clearAllFilters = () => {
    void setFilterState({
      search: null,
      sets: null,
      rarities: null,
      types: null,
      superTypes: null,
      domains: null,
      artVariants: null,
      finishes: null,
      energyMin: null,
      energyMax: null,
      mightMin: null,
      mightMax: null,
      powerMin: null,
      powerMax: null,
      priceMin: null,
      priceMax: null,
      owned: null,
      signed: null,
      promo: null,
      banned: null,
      errata: null,
      sort: null,
      sortDir: null,
    });
  };

  const setSearch = (search: string) => {
    void setFilterState({ search: search || null });
  };

  const toggleArrayFilter = (key: ArrayKey, value: string) => {
    const current = pendingRef.current[key] ?? filterState[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    pendingRef.current[key] = next;
    void setFilterState({ [key]: next.length > 0 ? next : null });
  };

  const setRange = (key: RangeKey, min: number | null, max: number | null) =>
    void setFilterState({ [`${key}Min`]: min, [`${key}Max`]: max });

  const toggleOwned = () => {
    const next =
      filterState.owned === null ? "true" : filterState.owned === "true" ? "false" : null;
    void setFilterState({ owned: next });
  };
  const clearOwned = () => void setFilterState({ owned: null });

  const toggleSigned = () => {
    const next =
      filterState.signed === null ? "true" : filterState.signed === "true" ? "false" : null;
    void setFilterState({ signed: next });
  };
  const togglePromo = () => {
    const next =
      filterState.promo === null ? "true" : filterState.promo === "true" ? "false" : null;
    void setFilterState({ promo: next });
  };
  const clearSigned = () => void setFilterState({ signed: null });
  const clearPromo = () => void setFilterState({ promo: null });
  const toggleBanned = () => {
    const next =
      filterState.banned === null ? "true" : filterState.banned === "true" ? "false" : null;
    void setFilterState({ banned: next });
  };
  const toggleErrata = () => {
    const next =
      filterState.errata === null ? "true" : filterState.errata === "true" ? "false" : null;
    void setFilterState({ errata: next });
  };
  const clearBanned = () => void setFilterState({ banned: null });
  const clearErrata = () => void setFilterState({ errata: null });

  const setSortBy = (sort: SortOption) => {
    void setFilterState({ sort: sort === "id" ? null : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    void setFilterState({ sortDir: dir === "asc" ? null : dir });
  };

  const setView = (v: "cards" | "printings" | "copies") => {
    void setFilterState({ view: v === "cards" ? null : v });
  };

  const setGroupBy = (groupBy: GroupByField) => {
    void setFilterState({ groupBy: groupBy === "set" ? null : groupBy });
  };

  const setGroupDir = (dir: SortDirection) => {
    void setFilterState({ groupDir: dir === "asc" ? null : dir });
  };

  return {
    setSearch,
    toggleArrayFilter,
    setRange,
    toggleOwned,
    clearOwned,
    toggleSigned,
    togglePromo,
    toggleBanned,
    toggleErrata,
    clearSigned,
    clearPromo,
    clearBanned,
    clearErrata,
    setSortBy,
    setSortDir,
    setView,
    setGroupBy,
    setGroupDir,
    clearAllFilters,
    toggleSearchField,
    selectAllSearchFields,
    selectOnlySearchField,
  };
}

/**
 * Convenience wrapper that merges `useFilterValues()` and `useFilterActions()`.
 * Existing consumers can use this without changes, but new code should prefer
 * the focused hooks to minimise re-renders.
 * @returns Combined filter values and action functions.
 */
export function useCardFilters() {
  const values = useFilterValues();
  const actions = useFilterActions();

  return {
    ...values,
    ...actions,
  };
}
