import type { AvailableFilters, PresenceDimension } from "@openrift/shared";

import type { useFilterValues } from "@/hooks/use-card-filters";
import { oversizeState } from "@/lib/oversize-filter";
import type { PresenceParamValue } from "@/lib/presence-filter";
import { PRESENCE_LABELS } from "@/lib/presence-filter";
import type { OwnedBucket } from "@/lib/search-schemas";

export const OWNED_BUCKETS: readonly { value: OwnedBucket; label: string }[] = [
  { value: "none", label: "None" },
  { value: "partial", label: "Partial Playset" },
  { value: "full", label: "Full Playset" },
  { value: "extra", label: "More than Full" },
];

export type FilterDimensionState = ReturnType<typeof useFilterValues>["filterState"];

export interface FilterDimensionAvailability {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  customTagCategoryCount: number;
  ownedCountMax?: number;
}

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

export interface FilterDimension {
  key: string;
  unit: string;
  section: string;
  hasContent: (input: FilterDimensionAvailability) => boolean;
  activeCount: (state: FilterDimensionState) => number;
  activeLabels: (state: FilterDimensionState, labels: FilterDimensionLabels) => string[];
}

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

function flagLabels(state: boolean | null, label: string): string[] {
  if (state === null) {
    return [];
  }
  return [state === false ? `−${label}` : label];
}

function presenceLabels(dimension: PresenceDimension, value: PresenceParamValue): string[] {
  if (value === null) {
    return [];
  }
  return [value === "none" ? `−${PRESENCE_LABELS[dimension]}` : PRESENCE_LABELS[dimension]];
}

function rangeCount(min: number | null, max: number | null): number {
  return min !== null || max !== null ? 1 : 0;
}

function setCount(value: unknown): number {
  return value === null ? 0 : 1;
}

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
    key: "overnumbered",
    unit: "variant",
    section: "overnumbered",
    hasContent: ({ availableFilters }) => availableFilters.hasOvernumbered,
    activeCount: (s) => setCount(s.overnumbered),
    activeLabels: (s) => flagLabels(s.overnumbered, "Overnumbered"),
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

export function filterDimension(key: string): FilterDimension {
  const dimension = BY_KEY.get(key);
  if (!dimension) {
    throw new Error(`Unknown filter dimension: ${key}`);
  }
  return dimension;
}

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

export function sectionHasContent(section: string, input: FilterDimensionAvailability): boolean {
  return FILTER_DIMENSIONS.some(
    (dimension) => dimension.section === section && dimension.hasContent(input),
  );
}

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
