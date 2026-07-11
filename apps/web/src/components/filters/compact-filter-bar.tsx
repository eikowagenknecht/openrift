import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { ChevronDownIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { FilterCustomizeControl } from "@/components/filters/filter-customize-control";
import { FilterMoreMenu } from "@/components/filters/filter-more-menu";
import {
  FilterChipSections,
  FilterRangeSections,
  FlagBadge,
} from "@/components/filters/filter-panel-content";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
  MultiSelectCombobox,
  NEUTRAL_HOVER_SCOPE,
} from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { clusterLabelsFit } from "@/lib/cluster-label-fit";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { rangeBadgeLabel } from "@/lib/range-label";
import { cn } from "@/lib/utils";

interface CompactFilterBarProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterCounts?: FilterCounts;
  /** See {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
  /**
   * The user's top-level placement units (see `lib/filter-sections.ts`).
   * Units in this set render as inline chips; every other applicable unit
   * lives in the "More" menu.
   */
  topLevelUnits: ReadonlySet<string>;
  /**
   * Extra classes for the bar element. The bar hides below `sm` by default
   * (the card browsers hand off to the mobile drawer there); a host without a
   * drawer (collection stats) passes `flex` to stay visible and wrap.
   */
  className?: string;
}

/**
 * Inline icon-toggle cluster for a small, stable, icon-bearing dimension
 * (Domain, Rarity). A connected segmented control (the same grouped-button look
 * as the deck list's domain filter); filters with a single click, no popover.
 * The text label and faceted count ride the tooltip / accessible name to keep
 * the bar compact; with `showLabels` (granted by the bar's fit measurement
 * whenever one row has the room) the label and count also render inline next
 * to the icon, like the expanded panel's badges.
 * @returns The labelled icon cluster.
 */
export function FilterIconCluster({
  label,
  options,
  included,
  excluded,
  onCycle,
  iconPath,
  displayLabel,
  counts,
  showLabels,
}: {
  label: string;
  options: string[];
  included: string[];
  excluded: string[];
  onCycle: (value: string) => void;
  iconPath: (value: string) => string | undefined;
  displayLabel: (value: string) => string;
  counts?: Map<string, number>;
  /** Render the text label + count next to each icon (see useClusterLabelsFit). */
  showLabels?: boolean;
}) {
  if (options.length === 0) {
    return null;
  }
  // The ToggleGroup tracks only the include set, so its `value` is `included`.
  // A click is translated into the tri-state cycle (off → include → exclude →
  // off): excluded options aren't "pressed" — they carry a destructive tint
  // instead — so we can't read the change from `value` membership. We diff the
  // proposed `value` against `included` to find the single clicked option and
  // hand it to `onCycle`, which decides include / exclude / clear.
  const onValueChange = (next: string[]) => {
    const added = next.find((value) => !included.includes(value));
    const removed = included.find((value) => !next.includes(value));
    const clicked = added ?? removed;
    if (clicked !== undefined) {
      onCycle(clicked);
    }
  };
  // No text label — the icons carry the meaning; the group still names itself
  // for assistive tech via aria-label, and each option via its tooltip.
  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      spacing={0}
      value={included}
      onValueChange={(next) => onValueChange(next as string[])}
      aria-label={`${label} filter`}
      // Marks the cluster for the bar's fit measurement, which swaps in the
      // measuring strip's expanded width for it (see useClusterLabelsFit).
      data-label-fit-cluster=""
    >
      {options.map((option) => {
        const count = counts?.get(option);
        const icon = iconPath(option);
        const isIncluded = included.includes(option);
        const isExcluded = excluded.includes(option);
        const isZero = counts !== undefined && (count ?? 0) === 0;
        const optionLabel = `${isExcluded ? "Exclude " : ""}${displayLabel(option)}${count === undefined ? "" : ` (${count})`}`;
        return (
          <Tooltip key={option}>
            <TooltipTrigger
              render={
                <ToggleGroupItem
                  value={option}
                  aria-label={optionLabel}
                  className={cn(
                    // Excluded: not pressed, so tint it destructive and strike
                    // the text fallback (icons can't strike, the tint carries it).
                    // Text + background tint suffice — no extra ring/border.
                    isExcluded && "text-destructive bg-destructive/10 line-through",
                    isZero && !isIncluded && !isExcluded && "opacity-40",
                  )}
                />
              }
            >
              {icon ? (
                <>
                  <CardIcon src={icon} className="size-4" />
                  {showLabels && (
                    <span>
                      {displayLabel(option)}
                      {/* Faceted count in the panel badges' muted style, so the
                          expanded toggles read like the expanded panel's rows. */}
                      {count !== undefined && (
                        <span className="ml-1 tabular-nums opacity-60">{count}</span>
                      )}
                    </span>
                  )}
                </>
              ) : (
                displayLabel(option)
              )}
            </TooltipTrigger>
            <TooltipContent>{optionLabel}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

/** Extra slack so a bar sitting exactly at the fit boundary doesn't flicker. */
const LABEL_FIT_BUFFER = 8;

/**
 * Decides whether the Domain/Rarity clusters can show their inline labels
 * without wrapping the bar onto a second row. The required width is computed
 * from the bar's in-flow children (skipping the clusters) plus the clusters'
 * expanded widths taken from an invisible measuring strip — inputs that don't
 * depend on the current label state, so the decision can't oscillate.
 *
 * Runs after every render (child chips appear, disappear, and change width
 * with filter state without resizing the bar element itself) and on resize of
 * the bar, the strip, or any child (fonts, counts). The setState bails when
 * the boolean is unchanged, so re-measures settle immediately.
 *
 * @returns Refs for the bar and the measuring strip, plus the fit verdict.
 */
function useClusterLabelsFit() {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [labelsFit, setLabelsFit] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const strip = measureRef.current;
    if (!bar || !strip) {
      return;
    }
    const compute = () => {
      const childWidths: number[] = [];
      for (const child of bar.children) {
        if (!(child instanceof HTMLElement)) {
          continue;
        }
        // Skip the clusters (the strip supplies their expanded widths) and
        // the strip itself (absolute, out of flow).
        if (
          child.dataset.labelFitCluster !== undefined ||
          child.dataset.labelFitMeasure !== undefined
        ) {
          continue;
        }
        childWidths.push(child.getBoundingClientRect().width);
      }
      const expandedClusterWidths = [...strip.children].map(
        (child) => child.getBoundingClientRect().width,
      );
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed columnGap is "6px"; Number() would yield NaN
      const gap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
      setLabelsFit(
        clusterLabelsFit({
          containerWidth: bar.clientWidth,
          childWidths,
          expandedClusterWidths,
          gap,
          buffer: LABEL_FIT_BUFFER,
        }),
      );
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(bar);
    observer.observe(strip);
    // Individual children too: a chip's count text can change width (filter
    // updates, font loading) without changing the bar's own box.
    for (const child of bar.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  });

  return { barRef, measureRef, labelsFit };
}

/**
 * A chip-styled popover trigger for one filter dimension. The trigger shows the
 * dimension label plus an active-selection count; the popover hosts the
 * dimension's controls (a badge grid, the stat sliders, or the More group).
 *
 * Pass `summary` to replace the "label (count)" trigger text with a readable
 * value when exactly one entry is active — like the value dropdowns ("Type" →
 * "Unit") and the More menu do — e.g. the Stats chip showing "Energy 1–3"
 * instead of "Stats (1)". When omitted (or when several entries are active) the
 * trigger falls back to the label plus the active count.
 * @returns The chip trigger and its popover.
 */
export function FilterDropdownChip({
  label,
  activeCount,
  summary,
  contentClassName,
  children,
}: {
  label: string;
  activeCount: number;
  summary?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  const active = activeCount > 0;
  return (
    <Popover>
      {/* Outline Button at size="sm" matches the Domain/Rarity ToggleGroup
          items (h-7, radius, padding); an active filter fills with primary —
          the same highlight the value dropdowns and the panel's selected
          badges use — so a set filter is unmistakable. */}
      <PopoverTrigger
        render={
          // Outline matched to the Domain/Rarity toggle group (transparent
          // resting, `bg-muted` when active), not the primary fill.
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "font-medium",
              FILTER_TRIGGER_CLASS,
              active && FILTER_TRIGGER_ACTIVE_CLASS,
            )}
          />
        }
        aria-label={summary ?? (active ? `${label}, ${activeCount} selected` : label)}
      >
        {summary ?? label}
        {active && !summary && <span className="tabular-nums">({activeCount})</span>}
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(NEUTRAL_HOVER_SCOPE, "w-max max-w-[90vw] min-w-64", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The compact card-browser filter bar: an alternative to the expanded
 * filter panel that collapses each dimension into either an inline icon
 * cluster (Domain, Rarity) or a dropdown chip (everything else). Rendered
 * in the above-the-grid area at every width from `sm` up (below `sm` the
 * mobile drawer takes over). This is the app's one and only filter layout.
 * Mirrors the section guards in `filter-panel-content.tsx`
 * — keep the two in sync when adding or removing a filter dimension.
 * @returns The compact filter bar.
 */
export function CompactFilterBar({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterCounts,
  ownedCountMax,
  topLevelUnits,
  className,
}: CompactFilterBarProps) {
  const { labels } = useEnumOrders();
  const { filterState, hasActiveFilters } = useFilterValues();
  const { cycleArrayFilter, toggleSigned, toggleStandard, clearAllFilters } = useFilterActions();
  const languageLabels = useLanguageLabels();
  const isTop = (unit: string) => topLevelUnits.has(unit);
  // Standard's promoted chip renders bar-level right after Variant (canonical
  // order); keep it out of the trailing chip sections so it isn't drawn twice.
  const chipSectionUnits = new Set([...topLevelUnits].filter((unit) => unit !== "standard"));
  // The Domain/Rarity clusters expand to icon + label + count whenever that
  // still fits on one row; the same builders feed the visible bar and the
  // invisible measuring strip the fit check reads.
  const { barRef, measureRef, labelsFit } = useClusterLabelsFit();
  const domainCluster = (showLabels: boolean) =>
    isTop("domains") && !hiddenSections?.has("domains") ? (
      <FilterIconCluster
        label="Domain"
        options={availableFilters.domains}
        included={filterState.domains}
        excluded={filterState.domainsEx}
        onCycle={(value) => cycleArrayFilter("domains", "domainsEx", value)}
        iconPath={(value) => getFilterIconPath("domains", value)}
        displayLabel={(value) => formatDomainFilterLabel(value, labels.domains)}
        counts={filterCounts?.domains}
        showLabels={showLabels}
      />
    ) : null;
  const rarityCluster = (showLabels: boolean) =>
    isTop("rarities") && !hiddenSections?.has("rarities") ? (
      <FilterIconCluster
        label="Rarity"
        options={availableFilters.rarities}
        included={filterState.rarities}
        excluded={filterState.raritiesEx}
        onCycle={(value) => cycleArrayFilter("rarities", "raritiesEx", value)}
        iconPath={(value) => getFilterIconPath("rarities", value)}
        displayLabel={(value) => labels.rarities[value] ?? value}
        counts={filterCounts?.rarities}
        showLabels={showLabels}
      />
    ) : null;

  // Art Variant, Finish, and Signed are all printing-variant axes, so they share
  // one "Variant" dropdown to keep the bar from crowding. Each section only
  // appears when it has content; the menu shows whenever any of them does.
  const showArtVariantSection =
    !hiddenSections?.has("artVariants") && availableFilters.artVariants.length > 1;
  const showFinishSection =
    !hiddenSections?.has("finishes") && availableFilters.finishes.length > 1;
  const showVariantMenu = isTop("variant") && (showArtVariantSection || showFinishSection);

  // Signed rides in the Variant dropdown when the Art Variant section is present
  // (mirroring the expanded panel); otherwise it renders as a flag chip / More
  // row wherever the Variant unit lives (see FilterChipSections).
  const signedInVariantMenu =
    availableFilters.hasSigned &&
    !hiddenSections?.has("signed") &&
    showVariantMenu &&
    showArtVariantSection;

  // Stats: the printed gameplay sliders only (Energy/Might/Power, always shown
  // unless hidden). Price and Copies are value/collection ranges under their
  // own placement units, each with its own chip when promoted.
  const showStats =
    isTop("stats") &&
    (!hiddenSections?.has("energy") ||
      !hiddenSections?.has("might") ||
      !hiddenSections?.has("power"));

  // The three printed-stat ranges, paired with their available bounds so a
  // single active one can resolve open-ended sides into a readable label.
  const statRanges = [
    {
      label: "Energy",
      min: filterState.energyMin,
      max: filterState.energyMax,
      bounds: availableFilters.energy,
    },
    {
      label: "Might",
      min: filterState.mightMin,
      max: filterState.mightMax,
      bounds: availableFilters.might,
    },
    {
      label: "Power",
      min: filterState.powerMin,
      max: filterState.powerMax,
      bounds: availableFilters.power,
    },
  ];
  const activeStatRanges = statRanges.filter((stat) => stat.min !== null || stat.max !== null);
  const statsActiveCount = activeStatRanges.length;

  // With exactly one stat slider in play, surface its value on the trigger
  // ("Energy 1–3") instead of a bare "Stats (1)" — mirroring the value dropdowns
  // and the More menu. Two or more fall back to the count, since one chip can't
  // spell out several ranges.
  const singleStatSummary =
    activeStatRanges.length === 1
      ? `${activeStatRanges[0].label} ${rangeBadgeLabel(
          activeStatRanges[0].min,
          activeStatRanges[0].max,
          activeStatRanges[0].bounds.min,
          activeStatRanges[0].bounds.max,
        )}`
      : undefined;

  // Price and Copies get their own dropdown chips when promoted; otherwise
  // they ride as slider rows in the "More" menu.
  const showPriceChip =
    isTop("price") && !hiddenSections?.has("price") && availableFilters.price.max > 0;
  const showCopiesChip =
    isTop("owned") &&
    !hiddenSections?.has("owned") &&
    ownedCountMax !== undefined &&
    ownedCountMax > 0;
  const priceActive = filterState.priceMin !== null || filterState.priceMax !== null;
  const priceSummary = priceActive
    ? `Price ${rangeBadgeLabel(
        filterState.priceMin,
        filterState.priceMax,
        availableFilters.price.min,
        availableFilters.price.max,
      )}`
    : undefined;
  const copiesActive = filterState.ownedCountMin !== null || filterState.ownedCountMax !== null;
  const copiesSummary = copiesActive
    ? `Copies ${rangeBadgeLabel(
        filterState.ownedCountMin,
        filterState.ownedCountMax,
        0,
        ownedCountMax ?? 0,
      )}`
    : undefined;

  // The "More" trigger's count: every active selection whose unit lives in the
  // menu (including exclude companions and folded presence flags, ADR-034).
  // Promoted units surface their counts on their own chips instead.
  const inMore = (unit: string) => !topLevelUnits.has(unit);
  const moreActiveCount =
    (inMore("languages") ? filterState.languages.length + filterState.languagesEx.length : 0) +
    (inMore("sets") ? filterState.sets.length + filterState.setsEx.length : 0) +
    (inMore("domains") ? filterState.domains.length + filterState.domainsEx.length : 0) +
    (inMore("rarities") ? filterState.rarities.length + filterState.raritiesEx.length : 0) +
    (inMore("types") ? filterState.types.length + filterState.typesEx.length : 0) +
    (inMore("superTypes")
      ? filterState.superTypes.length +
        filterState.superTypesEx.length +
        Number(filterState.superTypesPresence !== null)
      : 0) +
    (inMore("variant")
      ? filterState.artVariants.length +
        filterState.artVariantsEx.length +
        filterState.finishes.length +
        filterState.finishesEx.length +
        Number(filterState.signed !== null)
      : 0) +
    (inMore("stats") ? statsActiveCount : 0) +
    (inMore("markers")
      ? filterState.markers.length +
        filterState.markersEx.length +
        Number(filterState.markersPresence !== null)
      : 0) +
    (inMore("channels")
      ? filterState.channels.length +
        filterState.channelsEx.length +
        Number(filterState.channelsPresence !== null)
      : 0) +
    (inMore("customTags")
      ? filterState.customTags.length +
        filterState.customTagsEx.length +
        Number(filterState.customTagsPresence !== null)
      : 0) +
    (inMore("keywords")
      ? filterState.keywords.length +
        filterState.keywordsEx.length +
        Number(filterState.keywordsPresence !== null)
      : 0) +
    (inMore("tags")
      ? filterState.tags.length +
        filterState.tagsEx.length +
        Number(filterState.tagsPresence !== null)
      : 0) +
    (inMore("cardSizes") ? filterState.cardSizes.length : 0) +
    (inMore("owned")
      ? filterState.owned.length +
        Number(filterState.ownedCountMin !== null || filterState.ownedCountMax !== null)
      : 0) +
    (inMore("price") ? Number(priceActive) : 0) +
    (inMore("banned") ? Number(filterState.banned !== null) : 0) +
    (inMore("errata") ? Number(filterState.errata !== null) : 0) +
    (inMore("standard") ? Number(filterState.standard !== null) : 0);

  // Option lists for each cycling dropdown; a single row per value carries both
  // the include and exclude state (ADR-034).
  const languageOptions = (availableLanguages ?? []).map((value) => ({
    value,
    label: languageLabels[value] ?? value,
  }));
  const setOptions = availableFilters.sets.map((value) => {
    // `value` is the set code (e.g. "OGN"). Show it in a fixed-width gutter (via
    // `prefix`) ahead of the name so codes/names line up down the list; the
    // combobox folds it back into the trigger and search text as "OGN — Origins".
    const name = setDisplayLabel?.(value) ?? value;
    return name === value ? { value, label: value } : { value, label: name, prefix: value };
  });
  const typeOptions = availableFilters.types.map((value) => ({
    value,
    label: labels.cardTypes[value] ?? value,
  }));
  const superTypeOptions = availableFilters.superTypes.map((value) => ({
    value,
    label: labels.superTypes[value] ?? value,
  }));

  return (
    <TooltipProvider>
      {/* Order mirrors the expanded panel: Language, Set, Domain, Rarity, Type,
          Supertype, Variant (Art Variant + Finish + Signed), Stats, More. */}
      <div
        ref={barRef}
        className={cn("relative mb-3 hidden flex-wrap items-center gap-1.5 sm:flex", className)}
      >
        {isTop("languages") &&
          availableLanguages &&
          availableLanguages.length > 1 &&
          !hiddenSections?.has("languages") && (
            <MultiSelectCombobox
              triggerStyle="button"
              label="Language"
              searchPlaceholder="Search languages…"
              emptyText="No languages match."
              options={languageOptions}
              selected={filterState.languages}
              excluded={filterState.languagesEx}
              onCycle={(value) => cycleArrayFilter("languages", "languagesEx", value)}
              counts={filterCounts?.languages}
            />
          )}
        {isTop("sets") && !hiddenSections?.has("sets") && availableFilters.sets.length > 0 && (
          <MultiSelectCombobox
            triggerStyle="button"
            label="Sets"
            searchPlaceholder="Search sets…"
            emptyText="No sets match."
            options={setOptions}
            selected={filterState.sets}
            excluded={filterState.setsEx}
            onCycle={(value) => cycleArrayFilter("sets", "setsEx", value)}
            counts={filterCounts?.sets}
            mutedOptions={availableFilters.supplementalSets}
          />
        )}
        {domainCluster(labelsFit)}
        {rarityCluster(labelsFit)}
        {/* Invisible measuring strip: the clusters as they'd render with labels
            on, so the fit check knows the width labels would need regardless of
            the current state — that independence keeps the toggle from
            oscillating. Out of flow, invisible, and inert: never seen, never
            focusable, never announced. */}
        <div
          ref={measureRef}
          data-label-fit-measure=""
          aria-hidden="true"
          inert
          className="invisible absolute top-0 left-0 flex flex-nowrap gap-1.5"
        >
          {domainCluster(true)}
          {rarityCluster(true)}
        </div>
        {isTop("types") && !hiddenSections?.has("types") && availableFilters.types.length > 0 && (
          <MultiSelectCombobox
            triggerStyle="button"
            label="Type"
            searchPlaceholder="Search types…"
            emptyText="No types match."
            options={typeOptions}
            selected={filterState.types}
            excluded={filterState.typesEx}
            onCycle={(value) => cycleArrayFilter("types", "typesEx", value)}
            icon={(value) => getFilterIconPath("types", value)}
            iconAfterLabel
            counts={filterCounts?.types}
          />
        )}
        {isTop("superTypes") &&
          availableFilters.superTypes.length > 0 &&
          !hiddenSections?.has("superTypes") && (
            <MultiSelectCombobox
              triggerStyle="button"
              label="Supertype"
              searchPlaceholder="Search supertypes…"
              emptyText="No supertypes match."
              options={superTypeOptions}
              selected={filterState.superTypes}
              excluded={filterState.superTypesEx}
              onCycle={(value) => cycleArrayFilter("superTypes", "superTypesEx", value)}
              icon={(value) => getFilterIconPath("superTypes", value)}
              iconAfterLabel
              counts={filterCounts?.superTypes}
            />
          )}
        {showVariantMenu &&
          (() => {
            // Art Variant is the primary axis (and hosts the Signed flag); Finish
            // follows as a labeled axis. Each axis's rows cycle off → include →
            // exclude → off (ADR-034). When only one of the two applies, the menu
            // collapses to that single axis.
            const artVariantOptions = availableFilters.artVariants.map((value) => ({
              value,
              label: labels.artVariants[value] ?? value,
            }));
            const finishOptions = availableFilters.finishes.map((value) => ({
              value,
              label: labels.finishes[value] ?? value,
            }));
            const both = showArtVariantSection && showFinishSection;
            const primaryIsArt = showArtVariantSection;
            const primaryOptions = primaryIsArt ? artVariantOptions : finishOptions;
            const primaryIncludeKey = primaryIsArt ? "artVariants" : "finishes";
            const primaryExcludeKey = primaryIsArt ? "artVariantsEx" : "finishesEx";
            const primaryIncluded = primaryIsArt ? filterState.artVariants : filterState.finishes;
            const primaryExcluded = primaryIsArt
              ? filterState.artVariantsEx
              : filterState.finishesEx;
            const groups = both
              ? [
                  {
                    label: "Finish",
                    options: finishOptions,
                    included: filterState.finishes,
                    excluded: filterState.finishesEx,
                    onCycle: (value: string) => cycleArrayFilter("finishes", "finishesEx", value),
                    counts: filterCounts?.finishes,
                  },
                ]
              : [];
            return (
              <MultiSelectCombobox
                triggerStyle="button"
                label={both ? "Variant" : showArtVariantSection ? "Art Variant" : "Finish"}
                searchPlaceholder={both ? "Search variants…" : "Search…"}
                emptyText={both ? "No variants match." : "No matches."}
                primaryLabel={both ? "Art Variant" : undefined}
                options={primaryOptions}
                selected={primaryIncluded}
                excluded={primaryExcluded}
                onCycle={(value) => cycleArrayFilter(primaryIncludeKey, primaryExcludeKey, value)}
                counts={primaryIsArt ? filterCounts?.artVariants : filterCounts?.finishes}
                groups={groups}
                flag={
                  signedInVariantMenu
                    ? {
                        label: "Signed",
                        state: filterState.signed,
                        count: filterCounts?.flags.signed,
                        onToggle: toggleSigned,
                      }
                    : undefined
                }
                // Grouped Variant dropdown is short; size it to its content and
                // only scroll when the viewport is tight, like a menu.
                fitContent
              />
            );
          })()}
        {/* Standard sits right after Variant in the canonical order, so its
            promoted chip renders here rather than with the trailing chip
            sections (which are excluded from rendering it below). */}
        {isTop("standard") &&
          availableFilters.hasNonStandard &&
          !hiddenSections?.has("standard") && (
            <FlagBadge
              label="Standard"
              state={filterState.standard}
              count={filterCounts?.flags.standard}
              onClick={toggleStandard}
              triggerStyle="button"
            />
          )}
        {showStats && (
          <FilterDropdownChip
            label="Stats"
            activeCount={statsActiveCount}
            summary={singleStatSummary}
            contentClassName="w-80"
          >
            {/* Each stat slider row (a direct child div) gets the same subtle
                hover the More menu's rows have. bg-accent resolves to the neutral
                muted set by the popover's NEUTRAL_HOVER_SCOPE. */}
            <div className="[&>div:focus-within]:bg-accent [&>div:hover]:bg-accent flex flex-col gap-0.5 [&>div]:rounded-md [&>div]:px-1.5 [&>div]:py-1.5">
              <FilterRangeSections
                scope="stats"
                availableFilters={availableFilters}
                filterCounts={filterCounts}
                hiddenSections={hiddenSections}
                // Keep the slider labels consistent with the "More" menu's
                // sliders (text-sm, full-strength, not the panel's muted
                // text-xs gutter).
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        {/* Promoted chip units (markers, flags, owned, …) render inline with the
            same button language; Copies and Price get slider chips mirroring
            the Stats chip. The More menu hosts everything demoted (and nulls
            itself out when nothing lives there). */}
        <FilterChipSections
          availableFilters={availableFilters}
          hiddenSections={hiddenSections}
          visibleCustomTagCategories={visibleCustomTagCategories}
          filterCounts={filterCounts}
          units={chipSectionUnits}
          variant="inline"
        />
        {showCopiesChip && (
          <FilterDropdownChip
            label="Copies"
            activeCount={copiesActive ? 1 : 0}
            summary={copiesSummary}
            contentClassName="w-80"
          >
            <div className="[&>div:focus-within]:bg-accent [&>div:hover]:bg-accent flex flex-col gap-0.5 [&>div]:rounded-md [&>div]:px-1.5 [&>div]:py-1.5">
              <FilterRangeSections
                scope="copies"
                availableFilters={availableFilters}
                filterCounts={filterCounts}
                hiddenSections={hiddenSections}
                ownedCountMax={ownedCountMax}
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        {showPriceChip && (
          <FilterDropdownChip
            label="Price"
            activeCount={priceActive ? 1 : 0}
            summary={priceSummary}
            contentClassName="w-80"
          >
            <div className="[&>div:focus-within]:bg-accent [&>div:hover]:bg-accent flex flex-col gap-0.5 [&>div]:rounded-md [&>div]:px-1.5 [&>div]:py-1.5">
              <FilterRangeSections
                scope="price"
                availableFilters={availableFilters}
                filterCounts={filterCounts}
                hiddenSections={hiddenSections}
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        <FilterMoreMenu
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={hiddenSections}
          visibleCustomTagCategories={visibleCustomTagCategories}
          filterCounts={filterCounts}
          ownedCountMax={ownedCountMax}
          activeCount={moreActiveCount}
          topLevelUnits={topLevelUnits}
        />

        <div className="ml-auto flex items-center">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={clearAllFilters}
              aria-label="Clear all filters"
            >
              <XIcon className="size-4" />
            </Button>
          )}
          <FilterCustomizeControl className="text-muted-foreground" />
        </div>
      </div>
    </TooltipProvider>
  );
}
