import type { CardType, Rarity, SortOption } from "@openrift/shared";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";

const filterParsers = {
  search: parseAsString.withDefault(""),
  sets: parseAsArrayOf(parseAsString, ",").withDefault([]),
  rarities: parseAsArrayOf(parseAsString, ",").withDefault([]),
  types: parseAsArrayOf(parseAsString, ",").withDefault([]),
  domains: parseAsArrayOf(parseAsString, ",").withDefault([]),
  sort: parseAsString.withDefault("id"),
};

export function useCardFilters() {
  const [filterState, setFilterState] = useQueryStates(filterParsers, {
    history: "push",
  });

  const filters = useMemo(
    () => ({
      search: filterState.search,
      sets: filterState.sets,
      rarities: filterState.rarities as Rarity[],
      types: filterState.types as CardType[],
      domains: filterState.domains,
      costMin: null,
      costMax: null,
    }),
    [filterState],
  );

  const sortBy = filterState.sort as SortOption;

  const hasActiveFilters =
    filterState.search !== "" ||
    filterState.sets.length > 0 ||
    filterState.rarities.length > 0 ||
    filterState.types.length > 0 ||
    filterState.domains.length > 0;

  const clearAllFilters = () => {
    void setFilterState({
      search: null,
      sets: null,
      rarities: null,
      types: null,
      domains: null,
      sort: null,
    });
  };

  const setSearch = (search: string) => {
    void setFilterState({ search: search || null });
  };

  const toggleArrayFilter = (key: "sets" | "rarities" | "types" | "domains", value: string) => {
    const current = filterState[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    void setFilterState({ [key]: next.length > 0 ? next : null });
  };

  const setSortBy = (sort: SortOption) => {
    void setFilterState({ sort: sort === "id" ? null : sort });
  };

  return {
    filters,
    sortBy,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setSortBy,
    filterState,
  };
}
