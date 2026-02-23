import type { CardType, CardVariant, Rarity, SortDirection, SortOption } from "@openrift/shared";
import { parseAsArrayOf, parseAsFloat, parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef } from "react";

import { useSearchScope } from "@/hooks/use-search-scope";

const filterParsers = {
  search: parseAsString.withDefault(""),
  sets: parseAsArrayOf(parseAsString, ",").withDefault([]),
  rarities: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsString, ",").withDefault([]),
  superTypes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  domains: parseAsArrayOf(parseAsString, ",").withDefault([]),
  variants: parseAsArrayOf(parseAsString, ",").withDefault([]),
  energyMin: parseAsInteger,
  energyMax: parseAsInteger,
  mightMin: parseAsInteger,
  mightMax: parseAsInteger,
  powerMin: parseAsInteger,
  powerMax: parseAsInteger,
  priceMin: parseAsFloat,
  priceMax: parseAsFloat,
  sort: parseAsString.withDefault("id"),
  sortDir: parseAsString.withDefault("asc"),
};

export function useCardFilters() {
  const [filterState, setFilterState] = useQueryStates(filterParsers, {
    history: "push",
  });
  const { scope: searchScope, toggleField: toggleSearchField } = useSearchScope();

  // nuqs uses startTransition for history pushes, so filterState may lag behind
  // rapid successive clicks. Track the latest intended array values in a ref so
  // toggleArrayFilter always operates on the most recently written state.
  type ArrayKey = "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants";
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
      const pendingSorted = [...pending].sort();
      const syncedSorted = [...synced].sort();
      if (
        pendingSorted.length === syncedSorted.length &&
        pendingSorted.every((v, i) => v === syncedSorted[i])
      ) {
        pendingRef.current[key] = undefined;
      }
    }
  }, [filterState]);

  const filters = useMemo(
    () => ({
      search: filterState.search,
      searchScope,
      sets: filterState.sets,
      rarities: filterState.rarities as Rarity[],
      types: filterState.types as CardType[],
      superTypes: filterState.superTypes,
      domains: filterState.domains,
      variants: filterState.variants as CardVariant[],
      energyMin: filterState.energyMin,
      energyMax: filterState.energyMax,
      mightMin: filterState.mightMin,
      mightMax: filterState.mightMax,
      powerMin: filterState.powerMin,
      powerMax: filterState.powerMax,
      priceMin: filterState.priceMin,
      priceMax: filterState.priceMax,
    }),
    [filterState, searchScope],
  );

  const sortBy = filterState.sort as SortOption;
  const sortDir = filterState.sortDir as SortDirection;

  const hasActiveFilters =
    filterState.search !== "" ||
    filterState.sets.length > 0 ||
    filterState.rarities.length > 0 ||
    filterState.types.length > 0 ||
    filterState.superTypes.length > 0 ||
    filterState.domains.length > 0 ||
    filterState.variants.length > 0 ||
    filterState.energyMin !== null ||
    filterState.energyMax !== null ||
    filterState.mightMin !== null ||
    filterState.mightMax !== null ||
    filterState.powerMin !== null ||
    filterState.powerMax !== null ||
    filterState.priceMin !== null ||
    filterState.priceMax !== null;

  const clearAllFilters = () => {
    void setFilterState({
      search: null,
      sets: null,
      rarities: null,
      types: null,
      superTypes: null,
      domains: null,
      variants: null,
      energyMin: null,
      energyMax: null,
      mightMin: null,
      mightMax: null,
      powerMin: null,
      powerMax: null,
      priceMin: null,
      priceMax: null,
      sort: null,
      sortDir: null,
    });
  };

  const setSearch = (search: string) => {
    void setFilterState({ search: search || null });
  };

  const toggleArrayFilter = (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants",
    value: string,
  ) => {
    const current = pendingRef.current[key] ?? filterState[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    pendingRef.current[key] = next;
    void setFilterState({ [key]: next.length > 0 ? next : null });
  };

  const setEnergyRange = (min: number | null, max: number | null) =>
    void setFilterState({ energyMin: min, energyMax: max });
  const setMightRange = (min: number | null, max: number | null) =>
    void setFilterState({ mightMin: min, mightMax: max });
  const setPowerRange = (min: number | null, max: number | null) =>
    void setFilterState({ powerMin: min, powerMax: max });
  const setPriceRange = (min: number | null, max: number | null) =>
    void setFilterState({ priceMin: min, priceMax: max });

  const setSortBy = (sort: SortOption) => {
    void setFilterState({ sort: sort === "id" ? null : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    void setFilterState({ sortDir: dir === "asc" ? null : dir });
  };

  return {
    filters,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setEnergyRange,
    setMightRange,
    setPowerRange,
    setPriceRange,
    setSortBy,
    setSortDir,
    filterState,
    searchScope,
    toggleSearchField,
  };
}
