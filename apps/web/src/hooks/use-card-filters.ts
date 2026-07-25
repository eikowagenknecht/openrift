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
  // Negation companions (ADR-034). No exclude axis for `cardSizes` / `owned`.
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

/** URL search-param name that stores each presence dimension's any/none state. */
type PresenceParam =
  | "markersPresence"
  | "superTypesPresence"
  | "customTagsPresence"
  | "channelsPresence"
  | "keywordsPresence"
  | "tagsPresence";

/** Maps each presence dimension to its URL param (channels → distributionChannels). */
const PRESENCE_PARAMS: Record<PresenceDimension, PresenceParam> = {
  markers: "markersPresence",
  superTypes: "superTypesPresence",
  customTags: "customTagsPresence",
  distributionChannels: "channelsPresence",
  keywords: "keywordsPresence",
  tags: "tagsPresence",
};

/**
 * The include/exclude value params tied to a presence dimension, cleared when
 * that dimension is set to "none" (contradictory) and — reading in reverse —
 * consulted so picking a specific value clears a lingering "none". Keywords have
 * no value picker.
 */
const PRESENCE_VALUE_PARAMS: Record<PresenceDimension, { include?: ArrayKey; exclude?: ArrayKey }> =
  {
    markers: { include: "markers", exclude: "markersEx" },
    superTypes: { include: "superTypes", exclude: "superTypesEx" },
    customTags: { include: "customTags", exclude: "customTagsEx" },
    distributionChannels: { include: "channels", exclude: "channelsEx" },
    keywords: { include: "keywords", exclude: "keywordsEx" },
    tags: { include: "tags", exclude: "tagsEx" },
  };

/** Reverse of PRESENCE_VALUE_PARAMS include side: value array key → presence param. */
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
 * @returns The filter state with defaults applied.
 */
// The sort/group defaults arrive as four primitives rather than one object on
// purpose: passing a derived object into this call makes React Compiler treat
// it as maybe-mutated, which stops it caching `toFilterState` and re-mints
// `filters` every render (the /collections redraw loop — see the note in
// `useFilterValues` and the source guard in use-card-filters.test.ts).
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
    // Negation companions + standard (ADR-034).
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
 * Returns the read-only filter, sort, and view state derived from URL query
 * parameters. Components that only need to read (not write) filter state should
 * prefer this hook — it avoids subscribing to the setter functions, which are
 * referentially stable and never cause re-renders on their own.
 * @returns The current filter, sort, and view state.
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

  // The presence map is built inline, not via a helper. Passing the whole
  // filterState object into a helper call makes React Compiler treat it as
  // maybe-mutated, which stops it from caching toFilterState and re-mints
  // `filters` on every render. useDeferredValue(sortedCards) downstream then
  // never sees a stable value and re-renders forever (the /collections redraw
  // loop). A source-level guard test in use-card-filters.test.ts enforces this.
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
    // Copies-owned range — a web-app-only filter (live per-user data, not part
    // of the shared card catalog) applied alongside the `ownedFilter` buckets.
    ownedCountMin: filterState.ownedCountMin,
    ownedCountMax: filterState.ownedCountMax,
    isSigned: filterState.signed ?? null,
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
    // Negation companions + standard (ADR-034).
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
    filterState.markersPresence !== null ||
    filterState.superTypesPresence !== null ||
    filterState.customTagsPresence !== null ||
    filterState.channelsPresence !== null ||
    filterState.keywordsPresence !== null ||
    filterState.tagsPresence !== null ||
    filterState.banned !== null ||
    filterState.errata !== null ||
    // Standard-printing flag + every negation array (ADR-034). Without these,
    // a "Standard"-only or exclude-only filter silently trims the grid while
    // the funnel dot, count badge, and clear-all affordance stay dark.
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
 * Returns only the setter / action functions for filter state.
 *
 * Uses TanStack Router's `navigate({ search: (prev) => ... })` for updates.
 * The `prev` callback always receives the latest router state, so rapid clicks
 * are handled correctly without a pending-state workaround.
 * @returns The filter action functions.
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
      markersPresence: undefined,
      superTypesPresence: undefined,
      customTagsPresence: undefined,
      channelsPresence: undefined,
      keywordsPresence: undefined,
      tagsPresence: undefined,
      banned: undefined,
      errata: undefined,
      standard: undefined,
      // Negation companions (ADR-034).
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

  // Tri-state filter cycle (ADR-034), shared with the dropdowns' cycling rows via
  // {@link cycleIncludeExclude}: off → include → exclude → off, keeping the axis
  // in a single mode. See that helper for the full transition table.
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
        // Naming a specific value clears a lingering "none" presence for the
        // same dimension (the two contradict). Widening includes/excludes only.
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
    // React Compiler cannot lower TemplateLiteral computed keys in object
    // expressions, which silently bails this entire hook from memoization.
    // Hoist the keys to identifiers.
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

  const toggleSigned = () => {
    trackEvent("filter-apply", { type: "signed" });
    const next =
      filterState.signed === null ? true : filterState.signed === true ? false : undefined;
    updateSearch({ signed: next });
  };
  // Writes a presence state for a dimension. Setting "none" also clears any
  // specific value selection for the dimension, since requiring "no values"
  // contradicts naming values.
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
  // Tri-state presence cycle (folded into each dimension's picker): off → any
  // (require at least one value) → none (require zero) → off.
  const cyclePresence = (dimension: PresenceDimension) => {
    trackEvent("filter-apply", { type: "presence" });
    const current = filterState[PRESENCE_PARAMS[dimension]];
    const next = current === null ? "any" : current === "any" ? "none" : undefined;
    applyPresence(dimension, next);
  };
  const clearPresence = (dimension: PresenceDimension) =>
    updateSearch({ [PRESENCE_PARAMS[dimension]]: undefined });
  const clearSigned = () => updateSearch({ signed: undefined });
  const toggleBanned = () => {
    trackEvent("filter-apply", { type: "banned" });
    const next =
      filterState.banned === null ? true : filterState.banned === true ? false : undefined;
    updateSearch({ banned: next });
  };
  const toggleErrata = () => {
    trackEvent("filter-apply", { type: "errata" });
    const next =
      filterState.errata === null ? true : filterState.errata === true ? false : undefined;
    updateSearch({ errata: next });
  };
  const clearBanned = () => updateSearch({ banned: undefined });
  const clearErrata = () => updateSearch({ errata: undefined });
  const clearStandard = () => updateSearch({ standard: undefined });
  // Tri-state "standard printing" flag (ADR-034): null → true → false → null.
  const toggleStandard = () => {
    trackEvent("filter-apply", { type: "standard" });
    const next =
      filterState.standard === null ? true : filterState.standard === true ? false : undefined;
    updateSearch({ standard: next });
  };

  // Toolbar changes write both: the store remembers the choice for the next
  // visit, the URL keeps the current view shareable. A param equal to the
  // (possibly just-updated) default is dropped so a plain visit stays clean.
  const setSortBy = (sort: SortOption) => {
    viewPrefs.setSort(sort);
    updateSearch({ sort: sort === viewDefaults.sort ? undefined : sort });
  };

  const setSortDir = (dir: SortDirection) => {
    viewPrefs.setSortDir(dir);
    updateSearch({ sortDir: dir === viewDefaults.sortDir ? undefined : dir });
  };

  const setView = (v: "cards" | "printings" | "copies") => {
    // Marker / distribution-channel grouping is hidden in cards view, so switching
    // to cards from one of those resets the grouping to the "set" default instead
    // of leaving a now-unavailable selection in the URL.
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
    cyclePresence,
    clearPresence,
    toggleBanned,
    toggleErrata,
    toggleStandard,
    clearSigned,
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
 * Corrects a stale URL that pairs cards view with a printings-only grouping
 * (e.g. a hand-crafted or bookmarked `?view=cards&groupBy=marker`). Marker /
 * distribution channel collapse every card into a single bucket in cards view,
 * so this rewrites the URL once to drop the grouping (back to the "set"
 * default), rather than rendering a value that disagrees with the URL.
 *
 * Mounted once per card-browser surface (in `CardBrowserFilterProvider`). The
 * effect keys on the stale-state predicate, not on `setGroupBy` (which is
 * referentially unstable), so it fires exactly once per stale episode: after
 * the navigate lands, `groupBy` reads back as "set", the predicate flips false,
 * and the effect does not re-run. That self-termination is what keeps it from
 * looping the way a per-render value override did.
 * @returns Nothing.
 */
export function useStaleGroupByGuard() {
  const { view, groupBy } = useFilterValues();
  const { setGroupBy } = useFilterActions();

  // Latest-ref so the effect can call the current setter without listing the
  // unstable `setGroupBy` in its dependency array (which would re-run it every
  // render and re-fire the navigate while the URL change is still in flight).
  // The sync happens in an effect, not during render: React Compiler flags
  // ref mutation during render ("Cannot update ref during render"). React runs
  // effects in declaration order, so this commits the latest setter before the
  // stale-grouping effect below reads it.
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
