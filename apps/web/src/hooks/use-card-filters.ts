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
import { useRouter } from "@tanstack/react-router";

import { trackEvent } from "@/lib/analytics";
import type { FilterSearch } from "@/lib/search-schemas";
import { useFilterSearch } from "@/lib/search-schemas";
import { useSearchScopeStore } from "@/stores/search-scope-store";

type ArrayKey =
  | "sets"
  | "languages"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes";

/**
 * Build a `filterState` object from raw search params that matches the shape
 * consumers expect (defaults applied, `undefined` mapped to `null` for
 * nullable fields).
 * @returns The filter state with defaults applied.
 */
function toFilterState(raw: FilterSearch) {
  return {
    search: raw.search ?? "",
    sets: raw.sets ?? [],
    languages: raw.languages ?? [],
    rarities: raw.rarities ?? [],
    types: raw.types ?? [],
    superTypes: raw.superTypes ?? [],
    domains: raw.domains ?? [],
    artVariants: raw.artVariants ?? [],
    finishes: raw.finishes ?? [],
    energyMin: raw.energyMin ?? null,
    energyMax: raw.energyMax ?? null,
    mightMin: raw.mightMin ?? null,
    mightMax: raw.mightMax ?? null,
    powerMin: raw.powerMin ?? null,
    powerMax: raw.powerMax ?? null,
    priceMin: raw.priceMin ?? null,
    priceMax: raw.priceMax ?? null,
    owned: raw.owned ?? null,
    signed: raw.signed ?? null,
    promo: raw.promo ?? null,
    banned: raw.banned ?? null,
    errata: raw.errata ?? null,
    sort: raw.sort ?? "id",
    sortDir: raw.sortDir ?? "asc",
    view: raw.view ?? "cards",
    groupBy: raw.groupBy ?? "set",
    groupDir: raw.groupDir ?? "asc",
  };
}

/**
 * Returns the read-only filter, sort, and view state derived from URL query
 * parameters. Components that only need to read (not write) filter state should
 * prefer this hook — it avoids subscribing to the setter functions, which are
 * referentially stable and never cause re-renders on their own.
 * @returns The current filter, sort, and view state.
 */
export function useFilterValues() {
  const raw = useFilterSearch();
  const filterState = toFilterState(raw);
  const searchScope = useSearchScopeStore((s) => s.scope);

  const filters = {
    search: filterState.search,
    searchScope,
    sets: filterState.sets,
    languages: filterState.languages,
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
    filterState.languages.length > 0 ||
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
 * Uses TanStack Router's `navigate({ search: (prev) => ... })` for updates.
 * The `prev` callback always receives the latest router state, so rapid clicks
 * are handled correctly without a pending-state workaround.
 * @returns The filter action functions.
 */
export function useFilterActions() {
  const raw = useFilterSearch();
  const filterState = toFilterState(raw);
  const router = useRouter();
  const toggleSearchField = useSearchScopeStore((s) => s.toggleField);
  const selectAllSearchFields = useSearchScopeStore((s) => s.selectAll);
  const selectOnlySearchField = useSearchScopeStore((s) => s.selectOnly);

  /** Merge a partial update into the current search params via the router. */
  const updateSearch = (patch: Partial<FilterSearch>) => {
    void router.navigate({
      to: ".",
      search: (prev) =>
        Object.fromEntries(
          Object.entries({ ...prev, ...patch }).filter(([, v]) => v !== undefined),
        ),
    });
  };

  const clearAllFilters = () => {
    updateSearch({
      search: undefined,
      sets: undefined,
      languages: undefined,
      rarities: undefined,
      types: undefined,
      superTypes: undefined,
      domains: undefined,
      artVariants: undefined,
      finishes: undefined,
      energyMin: undefined,
      energyMax: undefined,
      mightMin: undefined,
      mightMax: undefined,
      powerMin: undefined,
      powerMax: undefined,
      priceMin: undefined,
      priceMax: undefined,
      owned: undefined,
      signed: undefined,
      promo: undefined,
      banned: undefined,
      errata: undefined,
      sort: undefined,
      sortDir: undefined,
    });
  };

  const setSearch = (search: string) => {
    updateSearch({ search: search || undefined });
  };

  const toggleArrayFilter = (key: ArrayKey, value: string) => {
    trackEvent("filter-apply", { type: key });
    void router.navigate({
      to: ".",
      search: (prev) => {
        const current = (prev[key as keyof typeof prev] as string[] | undefined) ?? [];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return Object.fromEntries(
          Object.entries({ ...prev, [key]: next.length > 0 ? next : undefined }).filter(
            ([, v]) => v !== undefined,
          ),
        );
      },
    });
  };

  const setArrayFilter = (key: ArrayKey, values: string[]) => {
    trackEvent("filter-apply", { type: key });
    updateSearch({ [key]: values.length > 0 ? values : undefined });
  };

  const setArrayFilters = (updates: Partial<Record<ArrayKey, string[]>>) => {
    const patch: Partial<FilterSearch> = {};
    for (const [key, values] of Object.entries(updates) as [ArrayKey, string[]][]) {
      (patch as Record<string, unknown>)[key] = values.length > 0 ? values : undefined;
    }
    updateSearch(patch);
  };

  const setRange = (key: RangeKey, min: number | null, max: number | null) => {
    trackEvent("filter-apply", { type: key });
    return updateSearch({
      [`${key}Min`]: min ?? undefined,
      [`${key}Max`]: max ?? undefined,
    } as Partial<FilterSearch>);
  };

  const toggleOwned = () => {
    trackEvent("filter-apply", { type: "owned" });
    const next =
      filterState.owned === null ? "true" : filterState.owned === "true" ? "false" : undefined;
    updateSearch({ owned: next });
  };
  const clearOwned = () => updateSearch({ owned: undefined });

  const toggleSigned = () => {
    trackEvent("filter-apply", { type: "signed" });
    const next =
      filterState.signed === null ? "true" : filterState.signed === "true" ? "false" : undefined;
    updateSearch({ signed: next });
  };
  const togglePromo = () => {
    trackEvent("filter-apply", { type: "promo" });
    const next =
      filterState.promo === null ? "true" : filterState.promo === "true" ? "false" : undefined;
    updateSearch({ promo: next });
  };
  const clearSigned = () => updateSearch({ signed: undefined });
  const clearPromo = () => updateSearch({ promo: undefined });
  const toggleBanned = () => {
    trackEvent("filter-apply", { type: "banned" });
    const next =
      filterState.banned === null ? "true" : filterState.banned === "true" ? "false" : undefined;
    updateSearch({ banned: next });
  };
  const toggleErrata = () => {
    trackEvent("filter-apply", { type: "errata" });
    const next =
      filterState.errata === null ? "true" : filterState.errata === "true" ? "false" : undefined;
    updateSearch({ errata: next });
  };
  const clearBanned = () => updateSearch({ banned: undefined });
  const clearErrata = () => updateSearch({ errata: undefined });

  const setSortBy = (sort: SortOption) => {
    updateSearch({ sort: sort === "id" ? undefined : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    updateSearch({ sortDir: dir === "asc" ? undefined : dir });
  };

  const setView = (v: "cards" | "printings" | "copies") => {
    updateSearch({ view: v === "cards" ? undefined : v });
  };

  const setGroupBy = (groupBy: GroupByField) => {
    updateSearch({ groupBy: groupBy === "set" ? undefined : groupBy });
  };

  const setGroupDir = (dir: SortDirection) => {
    updateSearch({ groupDir: dir === "asc" ? undefined : dir });
  };

  return {
    setSearch,
    toggleArrayFilter,
    setArrayFilter,
    setArrayFilters,
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
