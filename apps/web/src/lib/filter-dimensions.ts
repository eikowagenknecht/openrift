import type { AvailableFilters, PresenceDimension } from "@openrift/shared";

import type { useFilterValues } from "@/hooks/use-card-filters";
import { oversizeState } from "@/lib/oversize-filter";
import type { PresenceParamValue } from "@/lib/presence-filter";
import { PRESENCE_LABELS } from "@/lib/presence-filter";
import type { OwnedBucket } from "@/lib/search-schemas";

/** The four playset buckets of the Owned dimension, in display order. */
export const OWNED_BUCKETS: readonly { value: OwnedBucket; label: string }[] = [
  { value: "none", label: "None" },
  { value: "partial", label: "Partial Playset" },
  { value: "full", label: "Full Playset" },
  { value: "extra", label: "More than Full" },
];

/**
 * The filter state the registry reads. Taken straight off `useFilterValues` so
 * a renamed field breaks the build here instead of silently zeroing a count.
 */
export type FilterDimensionState = ReturnType<typeof useFilterValues>["filterState"];

/** The surface facts a dimension consults to decide whether it has content. */
export interface FilterDimensionAvailability {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  /** Custom-tag categories visible on this surface (after any category filter). */
  customTagCategoryCount: number;
  /** See {@link FilterPanelContentProps.ownedCountMax}; only the Copies row reads it. */
  ownedCountMax?: number;
}

/**
 * Display-label resolvers for the value dimensions, supplied by the caller
 * (they come from `/init` enums, the language table, and the surface's own
 * `setDisplayLabel`). Keyword and printed-tag values are their own names, so
 * they need no resolver.
 */
export interface FilterDimensionLabels {
  language: (code: string) => string;
  set: (code: string) => string;
  domain: (slug: string) => string;
  rarity: (slug: string) => string;
  type: (slug: string) => string;
  superType: (slug: string) => string;
  artVariant: (slug: string) => string;
  finish: (slug: string) => string;
  marker: (slug: string) => string;
  channel: (slug: string) => string;
  customTag: (slug: string) => string;
  ownedBucket: (value: string) => string;
}

/**
 * One filter axis, spelled once for every surface that renders filter chrome:
 * the compact bar's inline chips, the "More" menu, the chip sections, and the
 * placement/applicability logic in `filter-sections.ts`. Adding an axis means
 * adding an entry here — there is no second list to keep in sync.
 *
 * A dimension is finer-grained than a placement unit: the "variant" unit spans
 * Art Variant, Finish and Signed, "stats" spans the three printed-number
 * sliders, and "owned" spans the playset buckets and the Copies range. Units
 * decide placement (top level vs More); dimensions decide what renders.
 */
export interface FilterDimension {
  /** Unique key; also the key consumers use to look an entry up. */
  key: string;
  /** Placement unit this axis belongs to (see `FILTER_PLACEMENT_UNITS`). */
  unit: string;
  /** Section key a surface hides it by, via `hiddenSections`. */
  section: string;
  /** Whether this axis has anything to show on the surface. */
  hasContent: (input: FilterDimensionAvailability) => boolean;
  /**
   * Active selections on this axis — include values, exclude companions, a set
   * range, a flag, and the folded presence toggle all count as one each. The
   * compact bar sums these across the demoted units for the More trigger.
   */
  activeCount: (state: FilterDimensionState) => number;
  /**
   * Readable labels for every active selection, in the include/exclude
   * language the badges and chips use ("Signed", "−Has any marker"). The More
   * trigger names itself after the single entry when there is exactly one.
   */
  activeLabels: (state: FilterDimensionState, labels: FilterDimensionLabels) => string[];
}

/**
 * Include values plus their minus-prefixed exclude companions.
 * @returns One label per selection.
 */
function valueLabels(
  included: readonly string[],
  excluded: readonly string[],
  labelFor: (value: string) => string,
): string[] {
  return [
    ...included.map((value) => labelFor(value)),
    ...excluded.map((value) => `−${labelFor(value)}`),
  ];
}

/**
 * A tri-state flag's label, minus-prefixed while it forbids.
 * @returns The label, or nothing when the flag is off.
 */
function flagLabels(state: boolean | null, label: string): string[] {
  if (state === null) {
    return [];
  }
  return [state === false ? `−${label}` : label];
}

/**
 * A presence toggle's trait name, minus-prefixed for "none".
 * @returns The label, or nothing when the toggle is off.
 */
function presenceLabels(dimension: PresenceDimension, value: PresenceParamValue): string[] {
  if (value === null) {
    return [];
  }
  return [value === "none" ? `−${PRESENCE_LABELS[dimension]}` : PRESENCE_LABELS[dimension]];
}

/**
 * Counts a range as one active selection.
 * @returns 1 when either end is set, 0 otherwise.
 */
function rangeCount(min: number | null, max: number | null): number {
  return min !== null || max !== null ? 1 : 0;
}

/**
 * Counts a tri-state flag or presence toggle as one active selection.
 * @returns 1 when it is set, 0 otherwise.
 */
function setCount(value: unknown): number {
  return value === null ? 0 : 1;
}

/**
 * Every filter axis, in the canonical order of `FILTER_PLACEMENT_UNITS` — the
 * order the compact bar renders its chips, the More menu lists its rows, and
 * the customize popover offers its choices.
 */
export const FILTER_DIMENSIONS: readonly FilterDimension[] = [
  {
    key: "languages",
    unit: "languages",
    section: "languages",
    hasContent: ({ availableLanguages }) => (availableLanguages?.length ?? 0) > 1,
    activeCount: (s) => s.languages.length + s.languagesEx.length,
    activeLabels: (s, l) => valueLabels(s.languages, s.languagesEx, l.language),
  },
  {
    key: "sets",
    unit: "sets",
    section: "sets",
    hasContent: ({ availableFilters }) => availableFilters.sets.length > 0,
    activeCount: (s) => s.sets.length + s.setsEx.length,
    activeLabels: (s, l) => valueLabels(s.sets, s.setsEx, l.set),
  },
  {
    key: "domains",
    unit: "domains",
    section: "domains",
    hasContent: ({ availableFilters }) => availableFilters.domains.length > 0,
    activeCount: (s) => s.domains.length + s.domainsEx.length,
    activeLabels: (s, l) => valueLabels(s.domains, s.domainsEx, l.domain),
  },
  {
    key: "rarities",
    unit: "rarities",
    section: "rarities",
    hasContent: ({ availableFilters }) => availableFilters.rarities.length > 0,
    activeCount: (s) => s.rarities.length + s.raritiesEx.length,
    activeLabels: (s, l) => valueLabels(s.rarities, s.raritiesEx, l.rarity),
  },
  {
    key: "types",
    unit: "types",
    section: "types",
    hasContent: ({ availableFilters }) => availableFilters.types.length > 0,
    activeCount: (s) => s.types.length + s.typesEx.length,
    activeLabels: (s, l) => valueLabels(s.types, s.typesEx, l.type),
  },
  {
    key: "superTypes",
    unit: "superTypes",
    section: "superTypes",
    hasContent: ({ availableFilters }) => availableFilters.superTypes.length > 0,
    activeCount: (s) =>
      s.superTypes.length + s.superTypesEx.length + setCount(s.superTypesPresence),
    activeLabels: (s, l) => [
      ...valueLabels(s.superTypes, s.superTypesEx, l.superType),
      ...presenceLabels("superTypes", s.superTypesPresence),
    ],
  },
  // The Variant unit's three axes. Art Variant is the primary picker and hosts
  // the Signed flag when both render in the same host; Finish rides as a
  // labelled group beside it.
  {
    key: "artVariants",
    unit: "variant",
    section: "artVariants",
    hasContent: ({ availableFilters }) => availableFilters.artVariants.length > 1,
    activeCount: (s) => s.artVariants.length + s.artVariantsEx.length,
    activeLabels: (s, l) => valueLabels(s.artVariants, s.artVariantsEx, l.artVariant),
  },
  {
    key: "finishes",
    unit: "variant",
    section: "finishes",
    hasContent: ({ availableFilters }) => availableFilters.finishes.length > 1,
    activeCount: (s) => s.finishes.length + s.finishesEx.length,
    activeLabels: (s, l) => valueLabels(s.finishes, s.finishesEx, l.finish),
  },
  {
    key: "signed",
    unit: "variant",
    section: "signed",
    hasContent: ({ availableFilters }) => availableFilters.hasSigned,
    activeCount: (s) => setCount(s.signed),
    activeLabels: (s) => flagLabels(s.signed, "Signed"),
  },
  {
    key: "standard",
    unit: "standard",
    section: "standard",
    hasContent: ({ availableFilters }) => availableFilters.hasNonStandard,
    activeCount: (s) => setCount(s.standard),
    activeLabels: (s) => flagLabels(s.standard, "Standard"),
  },
  // The three printed-number sliders always render (a collapsed faceted range
  // renders disabled rather than vanishing), so they have no content gate.
  {
    key: "energy",
    unit: "stats",
    section: "energy",
    hasContent: () => true,
    activeCount: (s) => rangeCount(s.energyMin, s.energyMax),
    activeLabels: (s) => (rangeCount(s.energyMin, s.energyMax) ? ["Energy"] : []),
  },
  {
    key: "power",
    unit: "stats",
    section: "power",
    hasContent: () => true,
    activeCount: (s) => rangeCount(s.powerMin, s.powerMax),
    activeLabels: (s) => (rangeCount(s.powerMin, s.powerMax) ? ["Power"] : []),
  },
  {
    key: "might",
    unit: "stats",
    section: "might",
    hasContent: () => true,
    activeCount: (s) => rangeCount(s.mightMin, s.mightMax),
    activeLabels: (s) => (rangeCount(s.mightMin, s.mightMax) ? ["Might"] : []),
  },
  {
    key: "markers",
    unit: "markers",
    section: "markers",
    hasContent: ({ availableFilters }) => availableFilters.markers.length > 0,
    activeCount: (s) => s.markers.length + s.markersEx.length + setCount(s.markersPresence),
    activeLabels: (s, l) => [
      ...valueLabels(s.markers, s.markersEx, l.marker),
      ...presenceLabels("markers", s.markersPresence),
    ],
  },
  {
    // Two physical sizes exist, so Size is a single Oversized tri-state driven
    // off the plain `cardSizes` include array rather than a value list.
    key: "cardSizes",
    unit: "cardSizes",
    section: "cardSizes",
    hasContent: ({ availableFilters }) => availableFilters.cardSizes.length > 1,
    activeCount: (s) => s.cardSizes.length,
    activeLabels: (s) => flagLabels(oversizeState(s.cardSizes), "Oversized"),
  },
  {
    key: "channels",
    unit: "channels",
    section: "channels",
    hasContent: ({ availableFilters }) => availableFilters.distributionChannels.length > 0,
    activeCount: (s) => s.channels.length + s.channelsEx.length + setCount(s.channelsPresence),
    activeLabels: (s, l) => [
      ...valueLabels(s.channels, s.channelsEx, l.channel),
      ...presenceLabels("distributionChannels", s.channelsPresence),
    ],
  },
  {
    key: "customTags",
    unit: "customTags",
    section: "customTags",
    hasContent: ({ customTagCategoryCount }) => customTagCategoryCount > 0,
    activeCount: (s) =>
      s.customTags.length + s.customTagsEx.length + setCount(s.customTagsPresence),
    activeLabels: (s, l) => [
      ...valueLabels(s.customTags, s.customTagsEx, l.customTag),
      ...presenceLabels("customTags", s.customTagsPresence),
    ],
  },
  {
    // Printed-tag values are the exact card strings, so they label themselves.
    key: "tags",
    unit: "tags",
    section: "tags",
    hasContent: ({ availableFilters }) => availableFilters.tags.length > 0,
    activeCount: (s) => s.tags.length + s.tagsEx.length + setCount(s.tagsPresence),
    activeLabels: (s) => [
      ...valueLabels(s.tags, s.tagsEx, (tag) => tag),
      ...presenceLabels("tags", s.tagsPresence),
    ],
  },
  {
    // Keyword filter values are their own names too.
    key: "keywords",
    unit: "keywords",
    section: "keywords",
    hasContent: ({ availableFilters }) => availableFilters.keywords.length > 0,
    activeCount: (s) => s.keywords.length + s.keywordsEx.length + setCount(s.keywordsPresence),
    activeLabels: (s) => [
      ...valueLabels(s.keywords, s.keywordsEx, (keyword) => keyword),
      ...presenceLabels("keywords", s.keywordsPresence),
    ],
  },
  {
    key: "banned",
    unit: "banned",
    section: "banned",
    hasContent: ({ availableFilters }) => availableFilters.hasBanned,
    activeCount: (s) => setCount(s.banned),
    activeLabels: (s) => flagLabels(s.banned, "Banned"),
  },
  {
    key: "errata",
    unit: "errata",
    section: "errata",
    hasContent: ({ availableFilters }) => availableFilters.hasErrata,
    activeCount: (s) => setCount(s.errata),
    activeLabels: (s) => flagLabels(s.errata, "Errata"),
  },
  // The Owned unit's two halves: the playset buckets always apply where the
  // unit does; the Copies range needs the viewer to actually own something.
  {
    key: "owned",
    unit: "owned",
    section: "owned",
    hasContent: () => true,
    activeCount: (s) => s.owned.length,
    activeLabels: (s, l) => s.owned.map((value) => l.ownedBucket(value)),
  },
  {
    key: "copies",
    unit: "owned",
    section: "owned",
    hasContent: ({ ownedCountMax }) => ownedCountMax !== undefined && ownedCountMax > 0,
    activeCount: (s) => rangeCount(s.ownedCountMin, s.ownedCountMax),
    activeLabels: (s) => (rangeCount(s.ownedCountMin, s.ownedCountMax) ? ["Copies"] : []),
  },
  {
    key: "price",
    unit: "price",
    section: "price",
    hasContent: ({ availableFilters }) => availableFilters.price.max > 0,
    activeCount: (s) => rangeCount(s.priceMin, s.priceMax),
    activeLabels: (s) => (rangeCount(s.priceMin, s.priceMax) ? ["Price"] : []),
  },
];

const BY_KEY = new Map(FILTER_DIMENSIONS.map((dimension) => [dimension.key, dimension]));

/**
 * One dimension by key. Throws on an unknown key so a typo in a call site is a
 * test failure rather than a silently missing control.
 * @returns The registry entry.
 */
export function filterDimension(key: string): FilterDimension {
  const dimension = BY_KEY.get(key);
  if (!dimension) {
    throw new Error(`Unknown filter dimension: ${key}`);
  }
  return dimension;
}

/**
 * The dimension keys that have content on this surface and aren't hidden by
 * it — the one visibility predicate the compact bar, the More menu and the
 * chip sections all gate on (each then adds its own placement check).
 * @returns The applicable dimension keys.
 */
export function visibleFilterDimensions(
  input: FilterDimensionAvailability,
  hiddenSections?: ReadonlySet<string>,
): ReadonlySet<string> {
  const visible = new Set<string>();
  for (const dimension of FILTER_DIMENSIONS) {
    if (!hiddenSections?.has(dimension.section) && dimension.hasContent(input)) {
      visible.add(dimension.key);
    }
  }
  return visible;
}

/**
 * Whether any dimension covering `section` has content here. Backs the
 * placement-unit applicability check in `filter-sections.ts`.
 * @returns True when the section would render.
 */
export function sectionHasContent(section: string, input: FilterDimensionAvailability): boolean {
  return FILTER_DIMENSIONS.some(
    (dimension) => dimension.section === section && dimension.hasContent(input),
  );
}

/**
 * Total active selections across the dimensions whose unit `inScope` accepts.
 * The compact bar's "More" trigger counts the demoted units this way; a
 * promoted unit surfaces its own count on its own chip instead. Placement is
 * the only gate — a selection still counts while its dimension is hidden, so
 * the number never disagrees with what `clearAllFilters` would drop.
 * @returns The active-selection total.
 */
export function countActiveFilterDimensions(
  state: FilterDimensionState,
  inScope: (unit: string) => boolean,
): number {
  let total = 0;
  for (const dimension of FILTER_DIMENSIONS) {
    if (inScope(dimension.unit)) {
      total += dimension.activeCount(state);
    }
  }
  return total;
}

/**
 * Readable labels for every active selection across the dimensions whose unit
 * `inScope` accepts. The More trigger renders the single entry by name when
 * exactly one comes back.
 * @returns One label per active selection.
 */
export function activeFilterDimensionLabels(
  state: FilterDimensionState,
  labels: FilterDimensionLabels,
  inScope: (unit: string) => boolean,
): string[] {
  const entries: string[] = [];
  for (const dimension of FILTER_DIMENSIONS) {
    if (inScope(dimension.unit)) {
      entries.push(...dimension.activeLabels(state, labels));
    }
  }
  return entries;
}
