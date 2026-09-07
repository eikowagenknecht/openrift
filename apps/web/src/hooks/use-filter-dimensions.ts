import type { AvailableFilters } from "@openrift/shared";

import { useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList, useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { formatDomainFilterLabel } from "@/lib/domain";
import type { FilterDimensionLabels } from "@/lib/filter-dimensions";
import {
  activeFilterDimensionLabels,
  countActiveFilterDimensions,
  OWNED_BUCKETS,
  visibleFilterDimensions,
} from "@/lib/filter-dimensions";

interface FilterSurface {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.ownedCountMax}; only the Copies row reads it. */
  ownedCountMax?: number;
}

/**
 * A hook (not a bare call) so `availableFilters` stays out of the render-heavy
 * caller: React Compiler treats a value passed into a call as maybe-mutated.
 */
export function useVisibleFilterDimensions({
  availableFilters,
  availableLanguages,
  hiddenSections,
  visibleCustomTagCategories,
  ownedCountMax,
}: FilterSurface): ReadonlySet<string> {
  const { byCategory } = useCustomTagList();
  const customTagCategoryCount = [...byCategory.keys()].filter((category) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  ).length;
  return visibleFilterDimensions(
    { availableFilters, availableLanguages, customTagCategoryCount, ownedCountMax },
    hiddenSections,
  );
}

/** Promoted units surface their counts on their own chips instead. */
export function useMoreActiveCount(topLevelUnits: ReadonlySet<string>): number {
  const { filterState } = useFilterValues();
  return countActiveFilterDimensions(filterState, (unit) => !topLevelUnits.has(unit));
}

/**
 * Ranges have no single value and surface their dimension name instead ("Price").
 * Gated by the same demoted-unit set as {@link useMoreActiveCount}.
 */
export function useSingleActiveFilterLabel({
  availableFilters,
  setDisplayLabel,
  topLevelUnits,
}: {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  topLevelUnits: ReadonlySet<string>;
}): string | undefined {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const { filterState } = useFilterValues();
  const { byCategory: customTagsByCategory } = useCustomTagList();
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
  const markerLabels = new Map(availableFilters.markers.map((m) => [m.slug, m.label]));
  const channelLabels = new Map(
    availableFilters.distributionChannels.map((channel) => [
      channel.slug,
      channelBreadcrumbs.get(channel.id) ?? channel.label,
    ]),
  );
  const customTagLabels = new Map(
    [...customTagsByCategory.values()].flat().map((tag) => [tag.slug, tag.label]),
  );
  const ownedLabels = new Map<string, string>(
    OWNED_BUCKETS.map((bucket) => [bucket.value, bucket.label]),
  );
  // Every resolver falls back to the raw slug when the URL names a value the surface doesn't offer.
  const dimensionLabels: FilterDimensionLabels = {
    language: (code) => languageLabels[code] ?? code,
    set: (code) => setDisplayLabel?.(code) ?? code,
    domain: (slug) => formatDomainFilterLabel(slug, labels.domains),
    rarity: (slug) => labels.rarities[slug] ?? slug,
    type: (slug) => labels.cardTypes[slug] ?? slug,
    superType: (slug) => labels.superTypes[slug] ?? slug,
    artVariant: (slug) => labels.artVariants[slug] ?? slug,
    finish: (slug) => labels.finishes[slug] ?? slug,
    marker: (slug) => markerLabels.get(slug) ?? slug,
    channel: (slug) => channelLabels.get(slug) ?? slug,
    customTag: (slug) => customTagLabels.get(slug) ?? slug,
    ownedBucket: (value) => ownedLabels.get(value) ?? value,
  };
  const entries = activeFilterDimensionLabels(
    filterState,
    dimensionLabels,
    (unit) => !topLevelUnits.has(unit),
  );
  return entries.length === 1 ? entries[0] : undefined;
}
