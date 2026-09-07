import type {
  ArtVariant,
  CardSize,
  CardType,
  DefaultCardView,
  Domain,
  Finish,
  GroupByField,
  PresenceDimension,
  PresenceState,
  RangeKey,
  Rarity,
  SortDirection,
  SortOption,
  SuperType,
} from "@openrift/shared";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useSurfaceViewDefaults, useViewPrefsWriter } from "@/hooks/use-view-prefs";
import { trackEvent } from "@/lib/analytics";
import { cycleIncludeExclude } from "@/lib/filter-cycle";
import { isPrintingsOnlyGrouping } from "@/lib/group-by-field";
import type { FilterSearch, OwnedBucket } from "@/lib/search-schemas";
import { useFilterSearch } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSearchScopeStore } from "@/stores/search-scope-store";

type ArrayKey =
  | "sets"
  | "languages"
  | "rarities"
  | "types"
  | "superTypes"
  | "domains"
  | "artVariants"
  | "finishes"
  | "cardSizes"
  | "markers"
  | "channels"
  | "customTags"
  | "keywords"
  | "tags"
  | "owned"
  | "setsEx"
  | "languagesEx"
  | "raritiesEx"
  | "typesEx"
  | "superTypesEx"
  | "domainsEx"
  | "artVariantsEx"
  | "finishesEx"
  | "markersEx"
  | "channelsEx"
  | "customTagsEx"
  | "keywordsEx"
  | "tagsEx";

type PresenceParam =
  | "markersPresence"
  | "superTypesPresence"
  | "customTagsPresence"
  | "channelsPresence"
  | "keywordsPresence"
  | "tagsPresence";

const PRESENCE_PARAMS: Record<PresenceDimension, PresenceParam> = {
  markers: "markersPresence",
  superTypes: "superTypesPresence",
  customTags: "customTagsPresence",
  distributionChannels: "channelsPresence",
  keywords: "keywordsPresence",
  tags: "tagsPresence",
};

/** Cleared when the dimension's presence is "none"; consulted in reverse to
 * clear a lingering "none" when a value is picked. */
const PRESENCE_VALUE_PARAMS: Record<PresenceDimension, { include?: ArrayKey; exclude?: ArrayKey }> =
  {
    markers: { include: "markers", exclude: "markersEx" },
    superTypes: { include: "superTypes", exclude: "superTypesEx" },
    customTags: { include: "customTags", exclude: "customTagsEx" },
    distributionChannels: { include: "channels", exclude: "channelsEx" },
    keywords: { include: "keywords", exclude: "keywordsEx" },
    tags: { include: "tags", exclude: "tagsEx" },
  };

/** Reverse of PRESENCE_VALUE_PARAMS' include side; must mirror it. */
const ARRAY_KEY_PRESENCE_PARAM: Partial<Record<ArrayKey, PresenceParam>> = {
  markers: "markersPresence",
  superTypes: "superTypesPresence",
  customTags: "customTagsPresence",
  channels: "channelsPresence",
  keywords: "keywordsPresence",
  tags: "tagsPresence",
};

/**
 * Build a `filterState` object from raw search params that matches the shape
 * consumers expect (defaults applied, `undefined` mapped to `null` for
 * nullable fields).
 */
// Sort/group defaults are passed as primitives, not one object: a derived
// object makes React Compiler treat this call as maybe-mutated and stops it
// memoizing `toFilterState`, causing a render loop.
function toFilterState(
  raw: FilterSearch,
  defaultView: DefaultCardView,
  defaultSort: string,
  defaultSortDir: SortDirection,
  defaultGroupBy: string,
  defaultGroupDir: SortDirection,
) {
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
    cardSizes: raw.cardSizes ?? [],
    markers: raw.markers ?? [],
    channels: raw.channels ?? [],
    customTags: raw.customTags ?? [],
    keywords: raw.keywords ?? [],
    tags: raw.tags ?? [],
    setsEx: raw.setsEx ?? [],
    languagesEx: raw.languagesEx ?? [],
    raritiesEx: raw.raritiesEx ?? [],
    typesEx: raw.typesEx ?? [],
    superTypesEx: raw.superTypesEx ?? [],
    domainsEx: raw.domainsEx ?? [],
    artVariantsEx: raw.artVariantsEx ?? [],
    finishesEx: raw.finishesEx ?? [],
    markersEx: raw.markersEx ?? [],
    channelsEx: raw.channelsEx ?? [],
    customTagsEx: raw.customTagsEx ?? [],
    keywordsEx: raw.keywordsEx ?? [],
    tagsEx: raw.tagsEx ?? [],
    standard: raw.standard ?? null,
    energyMin: raw.energyMin ?? null,
    energyMax: raw.energyMax ?? null,
    mightMin: raw.mightMin ?? null,
    mightMax: raw.mightMax ?? null,
    powerMin: raw.powerMin ?? null,
    powerMax: raw.powerMax ?? null,
    priceMin: raw.priceMin ?? null,
    priceMax: raw.priceMax ?? null,
    ownedCountMin: raw.ownedCountMin ?? null,
    ownedCountMax: raw.ownedCountMax ?? null,
    owned: raw.owned ?? [],
    signed: raw.signed ?? null,
    overnumbered: raw.overnumbered ?? null,
    markersPresence: raw.markersPresence ?? null,
    superTypesPresence: raw.superTypesPresence ?? null,
    customTagsPresence: raw.customTagsPresence ?? null,
    channelsPresence: raw.channelsPresence ?? null,
    keywordsPresence: raw.keywordsPresence ?? null,
    tagsPresence: raw.tagsPresence ?? null,
    banned: raw.banned ?? null,
    errata: raw.errata ?? null,
    sort: raw.sort ?? defaultSort,
    sortDir: raw.sortDir ?? defaultSortDir,
    view: raw.view ?? defaultView,
    groupBy: raw.groupBy ?? defaultGroupBy,
    groupDir: raw.groupDir ?? defaultGroupDir,
  };
}

/**
 * Read-only filter/sort/view state from URL params. Prefer this over
 * `useFilterActions` when only reading: it skips subscribing to the setters.
 */
export function useFilterValues() {
  const raw = useFilterSearch();
  const defaultView = useDisplayStore((s) => s.defaultCardView);
  const viewDefaults = useSurfaceViewDefaults();
  const filterState = toFilterState(
    raw,
    defaultView,
    viewDefaults.sort,
    viewDefaults.sortDir,
    viewDefaults.groupBy,
    viewDefaults.groupDir,
  );
  const searchScope = useSearchScopeStore((s) => s.scope);

  // Built inline, not via a helper: passing the whole filterState object into
  // a helper call makes React Compiler treat it as maybe-mutated, which stops
  // memoization here and re-mints `filters` (and downstream state) every render.
  const presence: Partial<Record<PresenceDimension, PresenceState>> = {};
  if (filterState.markersPresence) {
    presence.markers = filterState.markersPresence;
  }
  if (filterState.superTypesPresence) {
    presence.superTypes = filterState.superTypesPresence;
  }
  if (filterState.customTagsPresence) {
    presence.customTags = filterState.customTagsPresence;
  }
  if (filterState.channelsPresence) {
    presence.distributionChannels = filterState.channelsPresence;
  }
  if (filterState.keywordsPresence) {
    presence.keywords = filterState.keywordsPresence;
  }
  if (filterState.tagsPresence) {
    presence.tags = filterState.tagsPresence;
  }

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
    cardSizes: filterState.cardSizes as CardSize[],
    ownedFilter: filterState.owned as OwnedBucket[],
    ownedCountMin: filterState.ownedCountMin,
    ownedCountMax: filterState.ownedCountMax,
    isSigned: filterState.signed ?? null,
    isOvernumbered: filterState.overnumbered ?? null,
    presence,
    markers: filterState.markers,
    channels: filterState.channels,
    markerSlugs: filterState.markers,
    distributionChannelSlugs: filterState.channels,
    customTagSlugs: filterState.customTags,
    keywords: filterState.keywords,
    tags: filterState.tags,
    isBanned: filterState.banned ?? null,
    hasErrata: filterState.errata ?? null,
    setsExclude: filterState.setsEx,
    languagesExclude: filterState.languagesEx,
    raritiesExclude: filterState.raritiesEx as Rarity[],
    typesExclude: filterState.typesEx as CardType[],
    superTypesExclude: filterState.superTypesEx as SuperType[],
    domainsExclude: filterState.domainsEx as Domain[],
    artVariantsExclude: filterState.artVariantsEx as ArtVariant[],
    finishesExclude: filterState.finishesEx as Finish[],
    markerSlugsExclude: filterState.markersEx,
    distributionChannelSlugsExclude: filterState.channelsEx,
    customTagSlugsExclude: filterState.customTagsEx,
    keywordsExclude: filterState.keywordsEx,
    tagsExclude: filterState.tagsEx,
    isStandard: filterState.standard ?? null,
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
    filterState.cardSizes.length > 0 ||
    filterState.markers.length > 0 ||
    filterState.channels.length > 0 ||
    filterState.customTags.length > 0 ||
    filterState.keywords.length > 0 ||
    filterState.tags.length > 0 ||
    filterState.energyMin !== null ||
    filterState.energyMax !== null ||
    filterState.mightMin !== null ||
    filterState.mightMax !== null ||
    filterState.powerMin !== null ||
    filterState.powerMax !== null ||
    filterState.priceMin !== null ||
    filterState.priceMax !== null ||
    filterState.ownedCountMin !== null ||
    filterState.ownedCountMax !== null ||
    filterState.owned.length > 0 ||
    filterState.signed !== null ||
    filterState.overnumbered !== null ||
    filterState.markersPresence !== null ||
    filterState.superTypesPresence !== null ||
    filterState.customTagsPresence !== null ||
    filterState.channelsPresence !== null ||
    filterState.keywordsPresence !== null ||
    filterState.tagsPresence !== null ||
    filterState.banned !== null ||
    filterState.errata !== null ||
    // Omitting these lets a "Standard"-only or exclude-only filter silently
    // trim the grid while the active-filter indicators stay off.
    filterState.standard !== null ||
    filterState.setsEx.length > 0 ||
    filterState.languagesEx.length > 0 ||
    filterState.raritiesEx.length > 0 ||
    filterState.typesEx.length > 0 ||
    filterState.superTypesEx.length > 0 ||
    filterState.domainsEx.length > 0 ||
    filterState.artVariantsEx.length > 0 ||
    filterState.finishesEx.length > 0 ||
    filterState.markersEx.length > 0 ||
    filterState.channelsEx.length > 0 ||
    filterState.customTagsEx.length > 0 ||
    filterState.keywordsEx.length > 0 ||
    filterState.tagsEx.length > 0;

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
 * Setter / action functions for filter state. Uses `navigate`'s `prev`
 * callback so rapid clicks stay correct without a pending-state workaround.
 */
export function useFilterActions() {
  const raw = useFilterSearch();
  const defaultView = useDisplayStore((s) => s.defaultCardView);
  const viewDefaults = useSurfaceViewDefaults();
  const viewPrefs = useViewPrefsWriter();
  const filterState = toFilterState(
    raw,
    defaultView,
    viewDefaults.sort,
    viewDefaults.sortDir,
    viewDefaults.groupBy,
    viewDefaults.groupDir,
  );
  const router = useRouter();
  const toggleSearchField = useSearchScopeStore((s) => s.toggleField);
  const selectAllSearchFields = useSearchScopeStore((s) => s.selectAll);
  const selectOnlySearchField = useSearchScopeStore((s) => s.selectOnly);

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
      // Language is intentionally preserved when clearing filters.
      rarities: undefined,
      types: undefined,
      superTypes: undefined,
      domains: undefined,
      artVariants: undefined,
      finishes: undefined,
      cardSizes: undefined,
      markers: undefined,
      channels: undefined,
      customTags: undefined,
      keywords: undefined,
      tags: undefined,
      energyMin: undefined,
      energyMax: undefined,
      mightMin: undefined,
      mightMax: undefined,
      powerMin: undefined,
      powerMax: undefined,
      priceMin: undefined,
      priceMax: undefined,
      ownedCountMin: undefined,
      ownedCountMax: undefined,
      owned: undefined,
      signed: undefined,
      overnumbered: undefined,
      markersPresence: undefined,
      superTypesPresence: undefined,
      customTagsPresence: undefined,
      channelsPresence: undefined,
      keywordsPresence: undefined,
      tagsPresence: undefined,
      banned: undefined,
      errata: undefined,
      standard: undefined,
      setsEx: undefined,
      // Language (incl. its negation companion) is preserved when clearing.
      raritiesEx: undefined,
      typesEx: undefined,
      superTypesEx: undefined,
      domainsEx: undefined,
      artVariantsEx: undefined,
      finishesEx: undefined,
      markersEx: undefined,
      channelsEx: undefined,
      customTagsEx: undefined,
      keywordsEx: undefined,
      tagsEx: undefined,
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

  // Tri-state cycle shared with cycleIncludeExclude: off → include → exclude → off.
  const cycleArrayFilter = (includeKey: ArrayKey, excludeKey: ArrayKey, value: string) => {
    trackEvent("filter-apply", { type: includeKey });
    void router.navigate({
      to: ".",
      search: (prev) => {
        const include = (prev[includeKey as keyof typeof prev] as string[] | undefined) ?? [];
        const exclude = (prev[excludeKey as keyof typeof prev] as string[] | undefined) ?? [];
        const { included: nextInclude, excluded: nextExclude } = cycleIncludeExclude(
          include,
          exclude,
          value,
        );
        // Naming a value clears a lingering "none" presence for the dimension;
        // the two are contradictory.
        const presenceParam = ARRAY_KEY_PRESENCE_PARAM[includeKey];
        const clearNone =
          presenceParam &&
          (nextInclude.length > 0 || nextExclude.length > 0) &&
          prev[presenceParam] === "none"
            ? { [presenceParam]: undefined }
            : {};
        return Object.fromEntries(
          Object.entries({
            ...prev,
            [includeKey]: nextInclude.length > 0 ? nextInclude : undefined,
            [excludeKey]: nextExclude.length > 0 ? nextExclude : undefined,
            ...clearNone,
          }).filter(([, entry]) => entry !== undefined),
        );
      },
    });
  };

  const setRange = (key: RangeKey, min: number | null, max: number | null) => {
    trackEvent("filter-apply", { type: key });
    // React Compiler can't lower template-literal computed keys in an object
    // expression, which bails this whole hook from memoization; hoist to identifiers.
    const minKey = `${key}Min` as const;
    const maxKey = `${key}Max` as const;
    return updateSearch({
      [minKey]: min ?? undefined,
      [maxKey]: max ?? undefined,
    } as Partial<FilterSearch>);
  };

  const setRanges = (
    updates: Partial<Record<RangeKey, { min: number | null; max: number | null } | null>>,
  ) => {
    const patch: Partial<FilterSearch> = {};
    for (const [key, value] of Object.entries(updates) as [
      RangeKey,
      { min: number | null; max: number | null } | null,
    ][]) {
      const minKey = `${key}Min` as const;
      const maxKey = `${key}Max` as const;
      (patch as Record<string, unknown>)[minKey] = value?.min ?? undefined;
      (patch as Record<string, unknown>)[maxKey] = value?.max ?? undefined;
    }
    updateSearch(patch);
  };

  const setOwnedCountRange = (min: number | null, max: number | null) => {
    trackEvent("filter-apply", { type: "ownedCount" });
    updateSearch({
      ownedCountMin: min ?? undefined,
      ownedCountMax: max ?? undefined,
    });
  };

  const clearOwned = () => updateSearch({ owned: undefined });

  const toggleFlag = (key: "signed" | "overnumbered" | "banned" | "errata" | "standard") => {
    trackEvent("filter-apply", { type: key });
    const current = filterState[key];
    updateSearch({ [key]: current === null ? true : current === true ? false : undefined });
  };
  const toggleSigned = () => toggleFlag("signed");
  const toggleOvernumbered = () => toggleFlag("overnumbered");
  const toggleBanned = () => toggleFlag("banned");
  const toggleErrata = () => toggleFlag("errata");
  const toggleStandard = () => toggleFlag("standard");
  const applyPresence = (dimension: PresenceDimension, next: PresenceState | undefined) => {
    const patch: Partial<FilterSearch> = { [PRESENCE_PARAMS[dimension]]: next };
    if (next === "none") {
      const valueParams = PRESENCE_VALUE_PARAMS[dimension];
      if (valueParams.include) {
        patch[valueParams.include] = undefined;
      }
      if (valueParams.exclude) {
        patch[valueParams.exclude] = undefined;
      }
    }
    updateSearch(patch);
  };
  const cyclePresence = (dimension: PresenceDimension) => {
    trackEvent("filter-apply", { type: "presence" });
    const current = filterState[PRESENCE_PARAMS[dimension]];
    const next = current === null ? "any" : current === "any" ? "none" : undefined;
    applyPresence(dimension, next);
  };
  const clearPresence = (dimension: PresenceDimension) =>
    updateSearch({ [PRESENCE_PARAMS[dimension]]: undefined });
  const clearSigned = () => updateSearch({ signed: undefined });
  const clearOvernumbered = () => updateSearch({ overnumbered: undefined });
  const clearBanned = () => updateSearch({ banned: undefined });
  const clearErrata = () => updateSearch({ errata: undefined });
  const clearStandard = () => updateSearch({ standard: undefined });

  const setSortBy = (sort: SortOption) => {
    viewPrefs.setSort(sort);
    updateSearch({ sort: sort === viewDefaults.sort ? undefined : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    viewPrefs.setSortDir(dir);
    updateSearch({ sortDir: dir === viewDefaults.sortDir ? undefined : dir });
  };

  const setView = (v: "cards" | "printings" | "copies") => {
    // Marker/channel grouping is unavailable in cards view.
    const resetGrouping =
      v === "cards" && isPrintingsOnlyGrouping(filterState.groupBy as GroupByField);
    updateSearch({
      view: v === defaultView ? undefined : v,
      ...(resetGrouping ? { groupBy: undefined } : {}),
    });
  };

  const setGroupBy = (groupBy: GroupByField) => {
    viewPrefs.setGroupBy(groupBy);
    updateSearch({ groupBy: groupBy === viewDefaults.groupBy ? undefined : groupBy });
  };

  const setGroupDir = (dir: SortDirection) => {
    viewPrefs.setGroupDir(dir);
    updateSearch({ groupDir: dir === viewDefaults.groupDir ? undefined : dir });
  };

  return {
    setSearch,
    toggleArrayFilter,
    cycleArrayFilter,
    setArrayFilter,
    setArrayFilters,
    setRange,
    setRanges,
    setOwnedCountRange,
    clearOwned,
    toggleSigned,
    toggleOvernumbered,
    cyclePresence,
    clearPresence,
    toggleBanned,
    toggleErrata,
    toggleStandard,
    clearSigned,
    clearOvernumbered,
    clearBanned,
    clearErrata,
    clearStandard,
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
 * The effect below must key on the stale-state predicate, not `setGroupBy`
 * itself, or it refires on every render during the reset navigation.
 */
export function useStaleGroupByGuard() {
  const { view, groupBy } = useFilterValues();
  const { setGroupBy } = useFilterActions();

  const setGroupByRef = useRef(setGroupBy);
  useEffect(() => {
    setGroupByRef.current = setGroupBy;
  });

  const isStaleGrouping = view === "cards" && isPrintingsOnlyGrouping(groupBy);

  useEffect(() => {
    if (isStaleGrouping) {
      setGroupByRef.current("set");
    }
  }, [isStaleGrouping]);
}
