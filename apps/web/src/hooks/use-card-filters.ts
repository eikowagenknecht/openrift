import type {
  ArtVariant,
  CardType,
  Domain,
  Finish,
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
  signed: parseAsString,
  promo: parseAsString,
  sort: parseAsString.withDefault("id"),
  sortDir: parseAsString.withDefault("asc"),
  view: parseAsString.withDefault("cards"),
};

export function useCardFilters() {
  const [filterState, setFilterState] = useQueryStates(filterParsers, {
    history: "push",
  });
  const searchScope = useSearchScopeStore((s) => s.scope);
  const toggleSearchField = useSearchScopeStore((s) => s.toggleField);

  // nuqs uses startTransition for history pushes, so filterState may lag behind
  // rapid successive clicks. Track the latest intended array values in a ref so
  // toggleArrayFilter always operates on the most recently written state.
  type ArrayKey =
    | "sets"
    | "rarities"
    | "types"
    | "superTypes"
    | "domains"
    | "artVariants"
    | "finishes";
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
    isSigned: filterState.signed === "true" ? true : filterState.signed === "false" ? false : null,
    isPromo: filterState.promo === "true" ? true : filterState.promo === "false" ? false : null,
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
  const view = filterState.view as "cards" | "printings";

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
    filterState.signed !== null ||
    filterState.promo !== null;

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
      signed: null,
      promo: null,
      sort: null,
      sortDir: null,
    });
  };

  const setSearch = (search: string) => {
    void setFilterState({ search: search || null });
  };

  const toggleArrayFilter = (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "artVariants" | "finishes",
    value: string,
  ) => {
    const current = pendingRef.current[key] ?? filterState[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    pendingRef.current[key] = next;
    void setFilterState({ [key]: next.length > 0 ? next : null });
  };

  const setRange = (key: RangeKey, min: number | null, max: number | null) =>
    void setFilterState({ [`${key}Min`]: min, [`${key}Max`]: max });

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

  const setSortBy = (sort: SortOption) => {
    void setFilterState({ sort: sort === "id" ? null : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    void setFilterState({ sortDir: dir === "asc" ? null : dir });
  };

  const setView = (v: "cards" | "printings") => {
    void setFilterState({ view: v === "cards" ? null : v });
  };

  return {
    filters,
    ranges,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setRange,
    toggleSigned,
    togglePromo,
    clearSigned,
    clearPromo,
    setSortBy,
    setSortDir,
    view,
    setView,
    filterState,
    searchScope,
    toggleSearchField,
  };
}
