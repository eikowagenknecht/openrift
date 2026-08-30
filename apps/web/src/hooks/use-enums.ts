import type {
  CardStatLabels,
  ColoredEnumRow,
  CustomTag,
  DeckZone,
  DistributionChannel,
  EnumOrders,
  EnumRow,
  VariantLabelEnumLabels,
} from "@openrift/shared";
import { labelMap } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

/** Label lookup maps for enums that need display labels in the UI. */
export interface EnumLabels extends VariantLabelEnumLabels, CardStatLabels {
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  graders: Record<string, string>;
}

// Generic over the row so a colored/described row keeps its extra fields
// through the sort instead of being widened back to the base row.
function sorted<T extends EnumRow>(rows: readonly T[]): T[] {
  return rows.toSorted((a, b) => a.sortOrder - b.sortOrder);
}

function slugs(rows: readonly EnumRow[]): string[] {
  return sorted(rows).map((row) => row.slug);
}

/** @returns The slug → label lookup, keyed in the enum's own display order. */
function sortedLabelMap(rows: readonly EnumRow[]): Record<string, string> {
  return labelMap(sorted(rows));
}

/** @returns The slug → hex-color lookup for the rows that have a color set. */
function colorMap(rows: readonly ColoredEnumRow[]): Record<string, string> {
  return Object.fromEntries(
    rows.flatMap((row) => (row.color === null ? [] : [[row.slug, row.color] as const])),
  );
}

/**
 * Returns deck zones sorted by their database sort_order.
 *
 * @returns Ordered array of DeckZone slugs and a label lookup map.
 */
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

/**
 * Returns a code-to-name lookup map for languages from the /init endpoint.
 *
 * @returns A Record mapping language codes (e.g. "EN") to display names (e.g. "English").
 */
export function useLanguageLabels(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sortedLabelMap(data.enums.languages ?? []);
}

/**
 * Returns ordered language rows from the /init endpoint, shaped as
 * `{ code, name, color }` for UI components that need the identifier, label, and
 * chip color.
 *
 * @returns An ordered array of `{ code, name, color }` language entries.
 */
export function useLanguageList(): { code: string; name: string; color: string | null }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.languages ?? []).map((row) => ({
    code: row.slug,
    name: row.label,
    color: row.color,
  }));
}

/**
 * Returns a language-code → hex-color lookup from the /init endpoint. Codes with
 * no color set are omitted (callers fall back to a neutral chip color).
 *
 * @returns A Record mapping language codes (e.g. "EN") to hex colors (e.g. "#2F6FED").
 */
export function useLanguageColors(): Record<string, string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return colorMap(data.enums.languages ?? []);
}

/**
 * Returns ordered deck-format rows from the /init endpoint along with a
 * slug → label lookup. Use this everywhere the UI needs to enumerate or label
 * deck formats — never hardcode format slugs or labels.
 *
 * @returns An ordered array of `{ slug, label }` entries and the matching label lookup.
 */
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

/**
 * Returns ordered condition rows (best first: Mint → Poor) from /init, for the
 * copy-details condition picker (ADR-038).
 *
 * @returns An ordered array of `{ slug, label }` condition entries.
 */
export function useConditionList(): { slug: string; label: string }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.conditions ?? []).map((row) => ({ slug: row.slug, label: row.label }));
}

/**
 * Returns ordered grading-company rows from /init, for the copy-details grader
 * picker (ADR-038).
 *
 * @returns An ordered array of `{ slug, label }` grader entries.
 */
export function useGraderList(): { slug: string; label: string }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return sorted(data.enums.graders ?? []).map((row) => ({ slug: row.slug, label: row.label }));
}

/**
 * Returns ordered marker rows from the /init endpoint, including descriptions.
 *
 * @returns An ordered array of `{ slug, label, description }` marker entries.
 */
export function useMarkerList(): { slug: string; label: string; description: string | null }[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  const rows = (data.enums.markers ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((row) => ({ slug: row.slug, label: row.label, description: row.description }));
}

/**
 * Returns the full distribution-channel registry (including parents that no
 * printing links to directly) from /init. Lets the filter UI render breadcrumb
 * labels via `buildChannelBreadcrumbs` without bundling the registry onto the
 * much larger catalog payload.
 *
 * Named distinctly from the admin-only `useDistributionChannels` (which talks
 * to the admin endpoint and returns per-channel counts) so the two don't
 * collide at import sites.
 *
 * @returns The channel registry.
 */
export function useChannelRegistry(): DistributionChannel[] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return data.distributionChannels ?? [];
}

/**
 * Catalogue-derived set of champion-identifier tags (e.g. "Ivern", "Karma")
 * from /init. Used by Custom-Region deck validation to distinguish champion
 * names from region/utility tags when checking that a Signature's matching
 * Champion is present in the deck.
 *
 * @returns Set of champion-identifier tag names.
 */
export function useChampionIdentifierTags(): ReadonlySet<string> {
  const { data } = useSuspenseQuery(initQueryOptions);
  return new Set(data.championIdentifierTags);
}

/**
 * Returns the admin-curated custom-tag vocabulary from /init. Used by the
 * freeform deck-builder filter to render the per-category tag chips.
 *
 * @returns Custom tags grouped by category, with each group already sorted.
 */
export function useCustomTagList(): { byCategory: Map<string, CustomTag[]>; all: CustomTag[] } {
  const { data } = useSuspenseQuery(initQueryOptions);
  const all = (data.customTags ?? []).toSorted(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  );
  const byCategory = Map.groupBy(all, (tag) => tag.category);
  return { byCategory, all };
}

/**
 * Returns the printed-tag classification from /init: the admin-managed tag
 * categories (region, champion, species, …) in display order, plus the tag →
 * category-slug map. Used by the filter chrome to group the tags facet into
 * per-category sections; tags absent from the map are unclassified.
 *
 * @returns Ordered categories and the tag → category-slug lookup.
 */
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

/**
 * Returns DB-derived sort orders and display labels for all game-data enums.
 * Use this instead of hardcoded *_ORDER arrays and *_LABELS maps.
 *
 * @returns Sort orders, label maps, and domain colors derived from the /api/init endpoint.
 */
export function useEnumOrders(): {
  orders: EnumOrders;
  labels: EnumLabels;
  domainColors: Record<string, string>;
  rarityColors: Record<string, string>;
} {
  const { data } = useSuspenseQuery(initQueryOptions);
  // Keep the contract's per-key typing: widening to an index signature turns a
  // typo'd key into a silently empty label map instead of a compile error.
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
