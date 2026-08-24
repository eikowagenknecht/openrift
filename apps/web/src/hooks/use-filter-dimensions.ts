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

/**
 * The surface facts every filter surface already has to hand. The hooks below
 * take them as one bag so a call site reads as "here is my surface" rather
 * than a five-argument list.
 */
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
 * The filter dimensions that have content on this surface and aren't hidden by
 * it — one predicate for the compact bar's chips, the More menu's rows and the
 * chip sections, replacing the per-dimension `showX` guards each used to spell
 * out. Callers still add their own placement check (`isTop` / `isMore` /
 * `showUnit`) on top.
 *
 * It is a hook rather than a bare call so the registry's `availableFilters`
 * argument stays out of the render-heavy components: React Compiler treats a
 * value passed into a call as maybe-mutated, and this returns a plain set of
 * keys, so nothing downstream inherits that.
 *
 * @returns The applicable dimension keys.
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

/**
 * The compact bar's "More" trigger count: every active selection whose unit
 * lives in the menu (exclude companions and folded presence flags included,
 * ADR-034). Promoted units surface their counts on their own chips instead.
 * @returns The number of active selections inside the More menu.
 */
export function useMoreActiveCount(topLevelUnits: ReadonlySet<string>): number {
  const { filterState } = useFilterValues();
  return countActiveFilterDimensions(filterState, (unit) => !topLevelUnits.has(unit));
}

/**
 * The name of the single active More entry, when exactly one is active — so
 * the trigger reads "Full Playset" the way the value dropdowns read "Unit",
 * instead of a bare "More (1)". Ranges have no single value, so they surface
 * their dimension name ("Price", "Energy"). Every entry is gated by its unit
 * being demoted, so the list lines up with {@link useMoreActiveCount}.
 * @returns The single entry's label, or undefined when zero or several are active.
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
  // Every resolver falls back to the raw slug: these labels are rendered from
  // whatever the URL holds, which can name a value the surface no longer offers.
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
