import type { AvailableFilters, FilterCounts, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import { CircleSlashIcon, MinusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCustomTagList, useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { buildChannelBreadcrumbs } from "@/lib/channel-breadcrumbs";
import { formatDomainFilterLabel } from "@/lib/domain";
import { compactFormatterForMarketplace } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import type { OwnedBucket } from "@/lib/search-schemas";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/** Number of discrete positions on the slider track in logarithmic mode. */
const LOG_STEPS = 1000;

/**
 * Map a real value to a slider position (0–LOG_STEPS) on a log scale.
 * @returns Slider position
 */
function valueToSliderPos(value: number, rangeMin: number, rangeMax: number): number {
  if (rangeMax <= rangeMin) {
    return 0;
  }
  const logMin = Math.log1p(rangeMin);
  const logMax = Math.log1p(rangeMax);
  return Math.round(((Math.log1p(value) - logMin) / (logMax - logMin)) * LOG_STEPS);
}

/**
 * Map a slider position (0–LOG_STEPS) back to a real value on a log scale.
 * @returns Real value
 */
function sliderPosToValue(position: number, rangeMin: number, rangeMax: number): number {
  if (rangeMax <= rangeMin) {
    return rangeMin;
  }
  const logMin = Math.log1p(rangeMin);
  const logMax = Math.log1p(rangeMax);
  return Math.round(Math.expm1(logMin + (position / LOG_STEPS) * (logMax - logMin)));
}

interface RangeSection {
  key: RangeKey;
  label: string;
  step?: number;
  logarithmic?: boolean;
  formatValue?: (v: number) => string;
}

const STAT_RANGE_SECTIONS: RangeSection[] = [
  { key: "energy", label: "Energy" },
  { key: "power", label: "Power" },
  { key: "might", label: "Might" },
];

export const OWNED_BUCKETS: readonly { value: OwnedBucket; label: string }[] = [
  { value: "none", label: "None" },
  { value: "partial", label: "Partial Playset" },
  { value: "full", label: "Full Playset" },
  { value: "extra", label: "More than Full" },
];

interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /**
   * Restricts the Custom Tags section to specific tag categories. Useful in
   * the deck builder where a tag-locked format only cares about one
   * category (e.g. Custom-Region → just "region") and other categories
   * would be noise. Omit (default) to show every category that has tags.
   */
  visibleCustomTagCategories?: ReadonlySet<string>;
  /** Override selected values for array filters (e.g. zone presets in the deck builder). */
  filterOverrides?: Partial<Record<string, string[]>>;
  /**
   * Per-dimension faceted counts. When present, each badge shows its match
   * count and zero-count options are dimmed. Omit to fall back to plain
   * unfaceted badges (deck builder, collection grid).
   */
  filterCounts?: FilterCounts;
  /**
   * Upper bound for the "Copies" owned-count range slider — the most copies the
   * user owns of any one card on this surface. Omit or pass 0 to hide the
   * slider (logged-out catalog, or surfaces where `"owned"` is hidden).
   */
  ownedCountMax?: number;
}

export function FilterPanelContent({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  ownedCountMax,
}: FilterPanelContentProps) {
  return (
    <>
      <FilterBadgeSections
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={hiddenSections}
        visibleCustomTagCategories={visibleCustomTagCategories}
        filterOverrides={filterOverrides}
        filterCounts={filterCounts}
      />
      <FilterRangeSections
        availableFilters={availableFilters}
        filterCounts={filterCounts}
        hiddenSections={hiddenSections}
        ownedCountMax={ownedCountMax}
      />
    </>
  );
}

export function FilterBadgeSections({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
}: FilterPanelContentProps) {
  const { labels } = useEnumOrders();
  const { filterState } = useFilterValues();
  const { toggleArrayFilter, cycleArrayFilter, toggleSigned } = useFilterActions();
  const languageLabels = useLanguageLabels();
  // Signed rides inside the Art Variant section (a signed card is, in effect, a
  // variant) when both are shown; otherwise it stays in the More group.
  const signedApplicable = availableFilters.hasSigned && !hiddenSections?.has("signed");
  const artVariantShown =
    availableFilters.artVariants.length > 1 && !hiddenSections?.has("artVariants");
  const signedInArtVariant = signedApplicable && artVariantShown;
  // Use overrides when URL state is empty (zone presets that aren't in the URL)
  const selected = (key: keyof typeof filterState) => {
    const urlValue = filterState[key];
    const arr = Array.isArray(urlValue) ? urlValue : [];
    return arr.length > 0 ? arr : (filterOverrides?.[key] ?? []);
  };
  return (
    <>
      {availableLanguages && availableLanguages.length > 1 && !hiddenSections?.has("languages") && (
        <FilterSection
          label="Language"
          options={availableLanguages}
          selected={filterState.languages}
          excluded={filterState.languagesEx}
          onCycle={(v) => cycleArrayFilter("languages", "languagesEx", v)}
          displayLabel={(code) => languageLabels[code] ?? code}
          counts={filterCounts?.languages}
        />
      )}
      {!hiddenSections?.has("sets") && (
        <FilterSection
          label="Set"
          options={availableFilters.sets}
          selected={filterState.sets}
          excluded={filterState.setsEx}
          onCycle={(v) => cycleArrayFilter("sets", "setsEx", v)}
          displayLabel={setDisplayLabel}
          secondaryOptions={availableFilters.supplementalSets}
          counts={filterCounts?.sets}
          wide
        />
      )}
      {!hiddenSections?.has("domains") && (
        <FilterSection
          label="Domain"
          options={availableFilters.domains}
          selected={selected("domains")}
          excluded={filterState.domainsEx}
          onCycle={(v) => cycleArrayFilter("domains", "domainsEx", v)}
          iconPath={(v) => getFilterIconPath("domains", v)}
          displayLabel={(v) => formatDomainFilterLabel(v, labels.domains)}
          counts={filterCounts?.domains}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        excluded={filterState.raritiesEx}
        onCycle={(v) => cycleArrayFilter("rarities", "raritiesEx", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
        displayLabel={(v) => labels.rarities[v] ?? v}
        counts={filterCounts?.rarities}
      />
      {!hiddenSections?.has("types") && (
        <FilterSection
          label="Type"
          options={availableFilters.types}
          selected={selected("types")}
          excluded={filterState.typesEx}
          onCycle={(v) => cycleArrayFilter("types", "typesEx", v)}
          iconPath={(v) => getFilterIconPath("types", v)}
          displayLabel={(v) => labels.cardTypes[v] ?? v}
          counts={filterCounts?.types}
        />
      )}
      {availableFilters.superTypes.length > 0 && !hiddenSections?.has("superTypes") && (
        <FilterSection
          label="Supertype"
          options={availableFilters.superTypes}
          selected={selected("superTypes")}
          excluded={filterState.superTypesEx}
          onCycle={(v) => cycleArrayFilter("superTypes", "superTypesEx", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
          displayLabel={(v) => labels.superTypes[v] ?? v}
          counts={filterCounts?.superTypes}
        />
      )}
      {artVariantShown && (
        <FilterSection
          label="Art Variant"
          options={availableFilters.artVariants}
          selected={filterState.artVariants}
          excluded={filterState.artVariantsEx}
          onCycle={(v) => cycleArrayFilter("artVariants", "artVariantsEx", v)}
          displayLabel={(v) => labels.artVariants[v] ?? v}
          counts={filterCounts?.artVariants}
          trailing={
            signedInArtVariant ? (
              <FlagBadge
                label="Signed"
                state={filterState.signed}
                count={filterCounts?.flags.signed}
                onClick={toggleSigned}
              />
            ) : undefined
          }
        />
      )}
      {availableFilters.finishes.length > 1 && !hiddenSections?.has("finishes") && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          excluded={filterState.finishesEx}
          onCycle={(v) => cycleArrayFilter("finishes", "finishesEx", v)}
          displayLabel={(v) => labels.finishes[v] ?? v}
          counts={filterCounts?.finishes}
        />
      )}
      {availableFilters.cardSizes.length > 1 && !hiddenSections?.has("cardSizes") && (
        <FilterSection
          label="Size"
          options={availableFilters.cardSizes}
          selected={filterState.cardSizes}
          onToggle={(v) => toggleArrayFilter("cardSizes", v)}
          displayLabel={(v) => labels.cardSizes[v] ?? v}
          counts={filterCounts?.cardSizes}
        />
      )}
      <FilterMoreSection
        availableFilters={availableFilters}
        hiddenSections={hiddenSections}
        visibleCustomTagCategories={visibleCustomTagCategories}
        filterOverrides={filterOverrides}
        filterCounts={filterCounts}
        hideSigned={signedInArtVariant}
      />
    </>
  );
}

/**
 * Whether the "More" group has any content to show on this surface, mirroring
 * the render guards in {@link FilterMoreSection}. Lets a host (e.g. the compact
 * filter bar) decide whether to offer the "More" entry point at all without
 * rendering an empty popover.
 * @returns True when at least one More control applies here.
 */
export function useHasMoreSectionContent({
  availableFilters,
  hiddenSections,
  visibleCustomTagCategories,
  hideSigned = false,
}: Pick<
  FilterPanelContentProps,
  "availableFilters" | "hiddenSections" | "visibleCustomTagCategories"
> & {
  /** Suppress the Signed flag (when it's surfaced elsewhere, e.g. in Art Variant). */
  hideSigned?: boolean;
}): boolean {
  const { byCategory } = useCustomTagList();
  const visibleCategoryCount = [...byCategory.keys()].filter((category) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  ).length;
  return (
    !hiddenSections?.has("owned") ||
    (!hideSigned && availableFilters.hasSigned && !hiddenSections?.has("signed")) ||
    (availableFilters.hasAnyMarker && !hiddenSections?.has("promo")) ||
    (availableFilters.hasBanned && !hiddenSections?.has("banned")) ||
    (availableFilters.hasErrata && !hiddenSections?.has("errata")) ||
    (availableFilters.hasNonStandard && !hiddenSections?.has("standard")) ||
    (!hiddenSections?.has("markers") && availableFilters.markers.length > 0) ||
    (!hiddenSections?.has("channels") && availableFilters.distributionChannels.length > 0) ||
    (!hiddenSections?.has("customTags") && visibleCategoryCount > 0)
  );
}

/**
 * The filter panel's "More" group: promo/signed/banned/errata/standard flag toggles,
 * the markers / distribution-channels / custom-tag comboboxes, and the owned
 * bucket combobox. Self-contained (sources its own enum/tag data) so both the
 * expanded panel and the compact filter bar render the identical controls.
 *
 * Returns null when no More content applies on this surface. `variant`
 * controls the wrapper: "section" keeps the panel's labelled row; "bare"
 * drops the label gutter for hosting inside the compact bar's "More" popover.
 * @returns The More group, or null when empty.
 */
function FilterMoreSection({
  availableFilters,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  variant = "section",
  triggerStyle = "chip",
  hideSigned = false,
}: Pick<
  FilterPanelContentProps,
  | "availableFilters"
  | "hiddenSections"
  | "visibleCustomTagCategories"
  | "filterOverrides"
  | "filterCounts"
> & {
  /** "section" = labelled panel row; "bare" = unlabelled, for the compact popover. */
  variant?: "section" | "bare";
  /** Trigger appearance forwarded to the flag toggles and comboboxes. */
  triggerStyle?: "chip" | "button";
  /** Suppress the Signed flag here (when it's surfaced in Art Variant instead). */
  hideSigned?: boolean;
}) {
  const { filterState } = useFilterValues();
  const {
    setArrayFilter,
    cycleArrayFilter,
    toggleSigned,
    togglePromo,
    toggleBanned,
    toggleErrata,
    toggleStandard,
  } = useFilterActions();
  // Pre-build channel breadcrumbs once so the section can render full paths
  // (e.g. "Tournament › Regionals › Top 8") and the cmdk filter can search them.
  const channelBreadcrumbs = buildChannelBreadcrumbs(availableFilters.distributionChannels);
  // Custom tags come from /init (admin-curated, not derived from the printing
  // set), so they're sourced directly here rather than threaded through
  // AvailableFilters like markers/channels.
  const { byCategory: customTagsByCategory } = useCustomTagList();
  // Effective set of categories after applying the visibility prop. Used both to
  // gate the section's appearance and to filter the per-category iteration —
  // keep them in sync via this single source.
  const visibleCategories = [...customTagsByCategory.entries()].filter(([category]) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  );
  // Use overrides when URL state is empty (zone presets that aren't in the URL).
  const selected = (key: keyof typeof filterState) => {
    const urlValue = filterState[key];
    const arr = Array.isArray(urlValue) ? urlValue : [];
    return arr.length > 0 ? arr : (filterOverrides?.[key] ?? []);
  };

  const hasContent = useHasMoreSectionContent({
    availableFilters,
    hiddenSections,
    visibleCustomTagCategories,
    hideSigned,
  });

  if (!hasContent) {
    return null;
  }

  // Shared between the Include primary list and the Exclude group so both halves
  // of each dropdown offer the same options (ADR-034).
  const markerOptions = availableFilters.markers.map((m) => ({ value: m.slug, label: m.label }));
  const channelOptions = availableFilters.distributionChannels.map((c) => ({
    value: c.slug,
    label: channelBreadcrumbs.get(c.id) ?? c.label,
  }));

  const items = (
    <>
      {availableFilters.hasAnyMarker && !hiddenSections?.has("promo") && (
        <FlagBadge
          label="Promo"
          state={filterState.promo}
          count={filterCounts?.flags.promo}
          onClick={togglePromo}
          triggerStyle={triggerStyle}
        />
      )}
      {!hiddenSections?.has("markers") && availableFilters.markers.length > 0 && (
        <MultiSelectCombobox
          label="Markers"
          searchPlaceholder="Search markers…"
          emptyText="No markers match."
          options={markerOptions}
          selected={filterState.markers}
          excluded={filterState.markersEx}
          onCycle={(value) => cycleArrayFilter("markers", "markersEx", value)}
          counts={filterCounts?.markers}
          triggerStyle={triggerStyle}
        />
      )}
      {!hiddenSections?.has("channels") && availableFilters.distributionChannels.length > 0 && (
        <MultiSelectCombobox
          label="Distribution Channels"
          searchPlaceholder="Search distribution channels…"
          emptyText="No distribution channels match."
          options={channelOptions}
          selected={filterState.channels}
          excluded={filterState.channelsEx}
          onCycle={(value) => cycleArrayFilter("channels", "channelsEx", value)}
          counts={filterCounts?.channels}
          triggerStyle={triggerStyle}
        />
      )}
      {!hiddenSections?.has("customTags") &&
        visibleCategories.map(([category, tagsInCategory]) => {
          // Each category gets its own dropdown, but they all write to the same
          // `customTags` URL key — so when toggling within one category we merge
          // with whatever the other categories already hold. `selected("customTags")`
          // is the union (URL or override fallback); we slice it down to this
          // category's slugs for the dropdown's `selected` prop.
          const allSelected = selected("customTags");
          const categorySlugs = new Set(tagsInCategory.map((t) => t.slug));
          const selectedInCategory = allSelected.filter((slug) => categorySlugs.has(slug));
          // Exclude companion, sliced the same way: each category's dropdown shows
          // only its own slugs from the shared `customTagsEx` key. The cycle acts
          // on the full arrays by value, so other categories stay untouched.
          const excludedInCategory = filterState.customTagsEx.filter((slug) =>
            categorySlugs.has(slug),
          );
          // `byCategory` is grouped from non-empty arrays, so the first tag
          // always exists and carries the joined category label from /init. The
          // `?? category` is a defensive fallback only.
          const label = tagsInCategory[0]?.categoryLabel ?? category;
          const tagOptions = tagsInCategory.map((t) => ({ value: t.slug, label: t.label }));
          return (
            <MultiSelectCombobox
              key={category}
              label={label}
              searchPlaceholder={`Search ${label.toLowerCase()}…`}
              emptyText={`No ${label.toLowerCase()} match.`}
              options={tagOptions}
              selected={selectedInCategory}
              excluded={excludedInCategory}
              onCycle={(value) => cycleArrayFilter("customTags", "customTagsEx", value)}
              triggerStyle={triggerStyle}
            />
          );
        })}
      {!hideSigned && availableFilters.hasSigned && !hiddenSections?.has("signed") && (
        <FlagBadge
          label="Signed"
          state={filterState.signed}
          count={filterCounts?.flags.signed}
          onClick={toggleSigned}
          triggerStyle={triggerStyle}
        />
      )}
      {availableFilters.hasBanned && !hiddenSections?.has("banned") && (
        <FlagBadge
          label="Banned"
          state={filterState.banned}
          count={filterCounts?.flags.banned}
          onClick={toggleBanned}
          triggerStyle={triggerStyle}
        />
      )}
      {availableFilters.hasErrata && !hiddenSections?.has("errata") && (
        <FlagBadge
          label="Errata"
          state={filterState.errata}
          count={filterCounts?.flags.errata}
          onClick={toggleErrata}
          triggerStyle={triggerStyle}
        />
      )}
      {availableFilters.hasNonStandard && !hiddenSections?.has("standard") && (
        <FlagBadge
          label="Standard"
          state={filterState.standard}
          count={filterCounts?.flags.standard}
          onClick={toggleStandard}
          triggerStyle={triggerStyle}
        />
      )}
      {!hiddenSections?.has("owned") && (
        <MultiSelectCombobox
          label="Owned"
          searchPlaceholder="Search owned…"
          emptyText="No options match."
          options={OWNED_BUCKETS.map((bucket) => ({
            value: bucket.value,
            label: bucket.label,
          }))}
          selected={filterState.owned}
          onChange={(values) => setArrayFilter("owned", values)}
          triggerStyle={triggerStyle}
        />
      )}
    </>
  );

  if (variant === "bare") {
    return <div className="flex flex-col items-start gap-1.5">{items}</div>;
  }
  return <FilterSection label="More">{items}</FilterSection>;
}

/**
 * A tri-state boolean filter (Promo, Signed, Banned, Errata, Standard) rendered
 * in the same include/exclude language as the multi-select badges (ADR-034):
 * `label` is just the trait name, and the state drives the look — a primary fill
 * to require it, a struck-out destructive tint with a leading minus to forbid it
 * ("−Promo"), an outline when off. The click cycles null → true → false → null.
 * @returns The flag badge or button.
 */
function FlagBadge({
  label,
  state,
  count,
  onClick,
  triggerStyle = "chip",
}: {
  label: string;
  state: boolean | null;
  count?: number;
  onClick: () => void;
  /** "chip" = panel badge; "button" = outline button matching the compact bar. */
  triggerStyle?: "chip" | "button";
}) {
  const isActive = state !== null;
  const isExcluded = state === false;
  const isZero = count !== undefined && count === 0;
  const content = (
    <>
      {isExcluded && <MinusIcon className="size-3 shrink-0" />}
      <span className={cn(isExcluded && "line-through")}>{label}</span>
      {count !== undefined && <span className="tabular-nums opacity-60">{count}</span>}
    </>
  );
  if (triggerStyle === "button") {
    return (
      <Button
        variant={state === true ? "default" : "outline"}
        size="sm"
        className={cn(
          "gap-1 font-medium",
          isExcluded && "border-destructive/40 text-destructive",
          isZero && !isActive && "opacity-40",
        )}
        onClick={onClick}
      >
        {content}
      </Button>
    );
  }
  return (
    <Badge
      variant={state === true ? "default" : "outline"}
      className={cn(
        "cursor-pointer gap-1",
        isExcluded && "border-destructive/40 text-destructive",
        isZero && !isActive && "opacity-40",
      )}
      onClick={onClick}
    >
      {content}
    </Badge>
  );
}

const HAS_NULL_KEY: Partial<Record<RangeKey, keyof AvailableFilters>> = {
  energy: "hasNullEnergy",
  might: "hasNullMight",
  power: "hasNullPower",
};

export function FilterRangeSections({
  availableFilters,
  filterCounts,
  hiddenSections,
  ownedCountMax,
  scope = "all",
  labelClassName,
}: Omit<FilterPanelContentProps, "setDisplayLabel"> & {
  /**
   * Which range rows to render. "stats" = the printed gameplay numbers
   * (Energy/Power/Might) only; "market" = the value/collection ranges (Price,
   * Copies) together; "price" / "copies" = just that one row (the More menu
   * places them in separate themed blocks); "all" (default) = every range, as
   * the expanded panel shows them. The compact bar splits them so its "Stats"
   * chip stays honest.
   */
  scope?: "all" | "stats" | "market" | "price" | "copies";
  /**
   * Overrides the row label's typography. Defaults to the filter panel's
   * muted `text-xs` gutter style; the More menu passes a `text-sm` override so
   * the slider labels match the menu's other entries.
   */
  labelClassName?: string;
}) {
  const { ranges, filterState } = useFilterValues();
  const { setRange, setOwnedCountRange } = useFilterActions();
  const favoriteMarketplace = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");

  // The price section uses the marketplace-aware compact currency formatter so
  // EUR users see "5 €" / "20k €" instead of "$5" / "$20000". The "k" shortening
  // keeps the slider's value column narrow enough for every thumb to line up.
  // The available range itself already reflects the favourite marketplace via
  // getAvailableFilters' getPrice.
  const priceSection: RangeSection = {
    key: "price",
    label: "Price",
    logarithmic: true,
    formatValue: compactFormatterForMarketplace(favoriteMarketplace),
  };
  const sections: RangeSection[] =
    scope === "stats"
      ? STAT_RANGE_SECTIONS
      : scope === "market" || scope === "price"
        ? [priceSection]
        : scope === "copies"
          ? []
          : [...STAT_RANGE_SECTIONS, priceSection];
  // Copies is a collection range, so it rides with the market/copies scope (and
  // the full panel), never with the gameplay stats or the price-only scope.
  const showCopies = scope === "all" || scope === "market" || scope === "copies";

  // Stat values (Energy/Power/Might) never exceed two digits, so the compact
  // Stats menu narrows the value columns to a single-digit-ish gutter; the
  // text-right min / text-left max keep the digits tight to the slider.
  const valueClassName = scope === "stats" ? "w-4" : undefined;

  return (
    <>
      {sections.map(({ key, label, ...rest }) => {
        if (hiddenSections?.has(key)) {
          return null;
        }
        // Prefer faceted bounds when available — they reflect the subset
        // matching every other active filter, so the slider track narrows
        // as the user filters and widens as they unselect.
        const facetedRange = filterCounts?.ranges[key];
        const available = facetedRange ?? availableFilters[key];
        const hasNullKey = HAS_NULL_KEY[key];
        const facetedHasNone =
          key !== "price" && facetedRange
            ? (facetedRange as { hasNullStat: boolean }).hasNullStat
            : undefined;
        const hasNone =
          facetedHasNone ?? (hasNullKey ? (availableFilters[hasNullKey] as boolean) : false);
        // Stat sliders always render — when the faceted range collapses
        // (e.g. an extreme price filter narrows results to a single card),
        // the slider is rendered disabled so the filter row keeps its
        // layout instead of vanishing. Price hides only when no priced
        // cards exist in the catalog at all.
        if (key === "price" && available.max === 0) {
          return null;
        }
        return (
          <RangeFilterSection
            key={key}
            label={label}
            availableMin={available.min}
            availableMax={available.max}
            selectedMin={ranges[key].min}
            selectedMax={ranges[key].max}
            hasNone={hasNone}
            onChange={(min, max) => setRange(key, min, max)}
            step={rest.step}
            logarithmic={rest.logarithmic}
            formatValue={rest.formatValue}
            labelClassName={labelClassName}
            valueClassName={valueClassName}
          />
        );
      })}
      {/* Copies owned — a web-app-only range gated the same as the Owned bucket
          dropdown. The bound is the user's actual maximum, so it only renders
          for logged-in users who own something on this surface. */}
      {showCopies &&
        !hiddenSections?.has("owned") &&
        ownedCountMax !== undefined &&
        ownedCountMax > 0 && (
          <RangeFilterSection
            label="Copies"
            availableMin={0}
            availableMax={ownedCountMax}
            selectedMin={filterState.ownedCountMin}
            selectedMax={filterState.ownedCountMax}
            onChange={(min, max) => setOwnedCountRange(min, max)}
            labelClassName={labelClassName}
          />
        )}
    </>
  );
}

function RangeFilterSection({
  label,
  availableMin,
  availableMax,
  selectedMin,
  selectedMax,
  hasNone = false,
  onChange,
  step = 1,
  logarithmic = false,
  formatValue,
  labelClassName,
  valueClassName = "w-10",
}: {
  label: string;
  availableMin: number;
  availableMax: number;
  selectedMin: number | null;
  selectedMax: number | null;
  hasNone?: boolean;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
  logarithmic?: boolean;
  formatValue?: (value: number) => string;
  labelClassName?: string;
  /**
   * Width of the min/max value columns. Defaults to `w-10` (fits "20k €" /
   * "None"); the compact Stats menu narrows it since its values never exceed
   * two digits.
   */
  valueClassName?: string;
}) {
  const sliderMin = hasNone ? NONE : availableMin;
  const defaultMin = hasNone ? NONE : availableMin;
  const resolvedMin = selectedMin ?? defaultMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;
  // "None" is the slider's bottom edge for fields that allow a no-value bucket.
  // Render it as a compact icon so the row doesn't widen to fit the 4-char word.
  const renderValue = (value: number): ReactNode =>
    value === NONE ? (
      <CircleSlashIcon
        className="inline-block size-3 align-[-0.1875em]"
        role="img"
        aria-label="None"
      />
    ) : (
      fmt(value)
    );

  // In logarithmic mode the slider operates on a linear 0–LOG_STEPS scale and
  // we convert between slider positions and real values with log/exp.
  const sMin = logarithmic ? 0 : sliderMin;
  const sMax = logarithmic ? LOG_STEPS : availableMax;
  const sStep = logarithmic ? 1 : step;
  // When the faceted range collapses to a single value, the slider math (Base
  // UI computes thumb position as (value - min) / (max - min)) divides by zero.
  // Render a disabled slider with a synthetic 1-unit range so the row stays in
  // layout but is non-interactive.
  const isDegenerate = sMax <= sMin;
  const renderSliderMin = sMin;
  const renderSliderMax = isDegenerate ? sMin + 1 : sMax;
  const toSlider = logarithmic
    ? (value: number) => valueToSliderPos(value, availableMin, availableMax)
    : (value: number) => value;
  const fromSlider = logarithmic
    ? (pos: number) => sliderPosToValue(pos, availableMin, availableMax)
    : (value: number) => value;

  const urlMin = toSlider(resolvedMin);
  const urlMax = toSlider(resolvedMax);
  // Local state mirrors the live thumb position; URL writes are debounced. Without this, keyboard auto-repeat fires onValueCommitted per keystroke (~30/sec), which both thrashes the catalog filter pipeline and trips the browser's history.replaceState rate limit (~200/30s in Firefox), wedging the route into the pending skeleton.
  const [dragValue, setDragValue] = useState<[number, number] | null>(null);
  const displayValue: [number, number] = isDegenerate
    ? [renderSliderMin, renderSliderMax]
    : (dragValue ?? [urlMin, urlMax]);
  const displayMin = dragValue ? fromSlider(dragValue[0]) : resolvedMin;
  const displayMax = dragValue ? fromSlider(dragValue[1]) : resolvedMax;

  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<[number, number] | null>(null);

  // Drop the local mirror only when the URL has caught up AND no further input is queued — otherwise a keystroke arriving during commit propagation would briefly snap the thumb back to the previously-committed value.
  useEffect(() => {
    if (
      dragValue !== null &&
      commitTimerRef.current === null &&
      pendingCommitRef.current === null
    ) {
      setDragValue(null);
    }
  }, [urlMin, urlMax, dragValue]);

  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
      }
    },
    [],
  );

  const commit = (values: [number, number]) => {
    const [newMin, newMax] = values;
    const atLeftEdge = newMin === sMin;
    const atRightEdge = newMax === sMax;
    if (atLeftEdge && atRightEdge) {
      onChange(null, null);
      return;
    }
    const realMin = fromSlider(newMin);
    const realMax = fromSlider(newMax);
    const minVal = atLeftEdge ? (hasNone ? NONE : null) : realMin;
    const maxVal = atRightEdge ? null : realMax;
    onChange(minVal, maxVal);
  };

  const scheduleCommit = (values: [number, number]) => {
    pendingCommitRef.current = values;
    if (commitTimerRef.current !== null) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const next = pendingCommitRef.current;
      pendingCommitRef.current = null;
      if (next) {
        commit(next);
      }
    }, 120);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Label */}
      <p className={cn("text-muted-foreground w-18 text-xs font-medium", labelClassName)}>
        {label}
      </p>
      {/* Slider with values */}
      <div className="flex flex-1 items-center gap-1">
        {/* Min value — fixed width so every slider's left thumb lines up. */}
        <span
          className={cn(
            "text-2xs text-muted-foreground shrink-0 text-right tabular-nums",
            valueClassName,
          )}
        >
          {renderValue(displayMin)}
        </span>
        {/* Slider */}
        <Slider
          min={renderSliderMin}
          max={renderSliderMax}
          step={sStep}
          value={displayValue}
          disabled={isDegenerate}
          aria-label={`${label} range`}
          onValueChange={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const next: [number, number] = [arr[0] ?? sMin, arr[1] ?? sMax];
            setDragValue(next);
            scheduleCommit(next);
          }}
          onValueCommitted={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const next: [number, number] = [arr[0] ?? sMin, arr[1] ?? sMax];
            scheduleCommit(next);
          }}
          className="flex-1"
        />
        {/* Max value — fixed width so every slider's right thumb lines up. */}
        <span
          className={cn("text-2xs text-muted-foreground shrink-0 tabular-nums", valueClassName)}
        >
          {renderValue(displayMax)}
        </span>
      </div>
    </div>
  );
}

function FilterSection({
  label,
  options,
  selected,
  excluded,
  onToggle,
  onCycle,
  iconPath,
  displayLabel,
  secondaryOptions,
  counts,
  wide,
  children,
  trailing,
}: {
  label: string;
  children?: ReactNode;
  options?: string[];
  selected?: string[];
  excluded?: string[];
  onToggle?: (value: string) => void;
  onCycle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  secondaryOptions?: ReadonlySet<string>;
  counts?: Map<string, number>;
  /** Span the full row in any multi-column parent grid. */
  wide?: boolean;
  /** Extra control(s) appended after the badges (e.g. the Signed flag in Art Variant). */
  trailing?: ReactNode;
}) {
  if (!children && !trailing && (!options || options.length === 0)) {
    return null;
  }

  return (
    <div className={cn("flex min-w-0 gap-2", wide && "lg:col-span-2")}>
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      {children ? (
        <div className="flex flex-1 flex-wrap gap-1">{children}</div>
      ) : (
        <FilterBadgeGrid
          options={options ?? []}
          selected={selected}
          excluded={excluded}
          onToggle={onToggle}
          onCycle={onCycle}
          iconPath={iconPath}
          displayLabel={displayLabel}
          secondaryOptions={secondaryOptions}
          counts={counts}
          trailing={trailing}
        />
      )}
    </div>
  );
}

/**
 * The wrapping row of toggleable filter badges for one dimension — icon +
 * label + faceted count, with selected/secondary/zero-count styling. Shared by
 * the expanded `FilterSection` and the compact bar's dropdown-chip popovers so
 * both render identical badges.
 * @returns The badge row.
 */
function FilterBadgeGrid({
  options,
  selected,
  excluded,
  onToggle,
  onCycle,
  iconPath,
  displayLabel,
  secondaryOptions,
  counts,
  className,
  trailing,
}: {
  options: string[];
  selected?: string[];
  /** Values in this dimension's exclude (`*Ex`) array; rendered struck-out. */
  excluded?: string[];
  onToggle?: (value: string) => void;
  /**
   * Tri-state click handler (off → include → exclude → off). When provided it
   * replaces `onToggle`, turning each badge into a cycling include/exclude
   * control (ADR-034). Pass `excluded` alongside it for the exclude styling.
   */
  onCycle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  secondaryOptions?: ReadonlySet<string>;
  counts?: Map<string, number>;
  className?: string;
  /** Extra control(s) rendered inline after the badges (e.g. the Signed flag in Art Variant). */
  trailing?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-1 flex-wrap gap-1", className)}>
      {options.map((option) => {
        const icon = iconPath?.(option);
        const isSelected = selected?.includes(option);
        const isExcluded = excluded?.includes(option);
        const isSecondary = secondaryOptions?.has(option);
        const count = counts?.get(option);
        const isZero = counts !== undefined && (count ?? 0) === 0;
        return (
          <Badge
            key={option}
            variant={!icon && isSelected ? "default" : "outline"}
            className={cn(
              "cursor-pointer",
              icon && "pr-0",
              // Excluded badges read as a struck-out "not this" in destructive
              // tint, distinct from an included badge's solid fill.
              !icon && isExcluded && "border-destructive/40 text-destructive line-through",
              isSecondary && !isSelected && !isExcluded && "opacity-65",
              isZero && !isSelected && !isExcluded && "opacity-40",
            )}
            onClick={() => (onCycle ? onCycle(option) : onToggle?.(option))}
          >
            {!icon && isExcluded && <MinusIcon className="size-3" />}
            {icon && <CardIcon src={icon} />}
            <span
              className={cn(
                icon && "-my-0.5 inline-flex h-5 items-center rounded-full px-2",
                icon && isSelected && "bg-primary text-primary-foreground",
                icon && isExcluded && "bg-destructive text-white line-through",
              )}
            >
              {displayLabel ? displayLabel(option) : option}
              {count !== undefined && <span className="ml-1 tabular-nums opacity-60">{count}</span>}
            </span>
          </Badge>
        );
      })}
      {trailing}
    </div>
  );
}
