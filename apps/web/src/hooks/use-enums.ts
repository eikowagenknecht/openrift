import type {
  ColoredEnumRow,
  CustomTag,
  DeckZone,
  DistributionChannel,
  EnumOrders,
  EnumRow,
} from "@openrift/shared";
import { labelMap } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";
import type { EnumLabels } from "@/lib/enum-labels";

// Generic over T: a colored/described row keeps its extra fields through the sort.
function sorted<T extends EnumRow>(rows: readonly T[]): T[] {
  return rows.toSorted((a, b) => a.sortOrder - b.sortOrder);
}

function slugs(rows: readonly EnumRow[]): string[] {
  return sorted(rows).map((row) => row.slug);
}

function sortedLabelMap(rows: readonly EnumRow[]): Record<string, string> {
  return labelMap(sorted(rows));
}

function colorMap(rows: readonly ColoredEnumRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.flatMap((row) => (row.color === null ? [] : [[row.slug, row.color] as const])),
  );
}

export function useZoneOrder(): {
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  const zones = data.enums.deckZones ?? [];
  const s = sorted(zones);
  return {
    zoneOrder: s.map((zone) => zone.slug as DeckZone),
    zoneLabels: Object.fromEntries(s.map((zone) => [zone.slug, zone.label])) as Record<
      DeckZone,
      string
    >,
  };
}

export function useLanguageLabels(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sortedLabelMap(data.enums.languages ?? []);
}

export function useLanguageList(): { code: string; name: string; color: string | null }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.languages ?? []).map((row) => ({
    code: row.slug,
    name: row.label,
    color: row.color,
  }));
}

/** Omits codes with no color set. */
export function useLanguageColors(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return colorMap(data.enums.languages ?? []);
}

export function useDeckFormatList(): {
  formats: { slug: string; label: string }[];
  labels: Record<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  const rows = sorted(data.enums.deckFormats ?? []);
  return {
    formats: rows.map((row) => ({ slug: row.slug, label: row.label })),
    labels: Object.fromEntries(rows.map((row) => [row.slug, row.label])),
  };
}

/** Ordered best-to-worst: Mint → Poor. */
export function useConditionList(): { slug: string; label: string }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.conditions ?? []).map((row) => ({ slug: row.slug, label: row.label }));
}

export function useGraderList(): { slug: string; label: string }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.graders ?? []).map((row) => ({ slug: row.slug, label: row.label }));
}

export function useMarkerList(): { slug: string; label: string; description: string | null }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  const rows = (data.enums.markers ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((row) => ({ slug: row.slug, label: row.label, description: row.description }));
}

/**
 * Includes parents that no printing links to directly. Distinct from the
 * admin-only `useDistributionChannels` to avoid import-site collisions.
 */
export function useChannelRegistry(): DistributionChannel[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return data.distributionChannels ?? [];
}

export function useChampionIdentifierTags(): ReadonlySet<string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return new Set(data.championIdentifierTags);
}

export function useCustomTagList(): { byCategory: Map<string, CustomTag[]>; all: CustomTag[] } {
  const { data } = useSuspenseQuery(initQueryOptions);
  const all = (data.customTags ?? []).toSorted(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  );
  const byCategory = Map.groupBy(all, (tag) => tag.category);
  return { byCategory, all };
}

/** Tags absent from the map are unclassified. */
export function useTagCategories(): {
  categories: { slug: string; label: string; sortOrder: number }[];
  categoryByTag: ReadonlyMap<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  // `?? []` / `?? {}` guard deploy skew: a freshly-shipped web bundle can be
  // served an /init payload cached before the API learned these keys.
  const categories = (data.tagCategories ?? []).toSorted(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  );
  const categoryByTag = new Map(Object.entries(data.tagCategoryMap ?? {}));
  return { categories, categoryByTag };
}

export function useEnumOrders(): {
  orders: EnumOrders;
  labels: EnumLabels;
  domainColors: Record<string, string>;
  rarityColors: Record<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  // Keep the contract's per-key typing: widening to an index signature would
  // let a typo'd key compile and produce a silently empty label map.
  const d = data.enums;
  return {
    orders: {
      finishes: slugs(d.finishes ?? []),
      rarities: slugs(d.rarities ?? []),
      domains: slugs(d.domains ?? []),
      cardTypes: slugs(d.cardTypes ?? []),
      superTypes: slugs(d.superTypes ?? []),
      artVariants: slugs(d.artVariants ?? []),
      cardSizes: slugs(d.cardSizes ?? []),
    },
    labels: {
      finishes: sortedLabelMap(d.finishes ?? []),
      rarities: sortedLabelMap(d.rarities ?? []),
      domains: sortedLabelMap(d.domains ?? []),
      cardTypes: sortedLabelMap(d.cardTypes ?? []),
      superTypes: sortedLabelMap(d.superTypes ?? []),
      artVariants: sortedLabelMap(d.artVariants ?? []),
      cardSizes: sortedLabelMap(d.cardSizes ?? []),
      conditions: sortedLabelMap(d.conditions ?? []),
      graders: sortedLabelMap(d.graders ?? []),
    },
    domainColors: colorMap(d.domains ?? []),
    rarityColors: colorMap(d.rarities ?? []),
  };
}
