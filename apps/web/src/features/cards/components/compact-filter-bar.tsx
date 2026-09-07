import { enumLabel } from "@openrift/shared/enum-label";
import type { AvailableFilters, FilterCounts } from "@openrift/shared/filters";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FilterChipSections } from "@/features/cards/components/filter-chip-sections";
import { FilterCustomizeControl } from "@/features/cards/components/filter-customize-control";
import { FlagBadge } from "@/features/cards/components/filter-flag-badge";
import { FilterMoreMenu } from "@/features/cards/components/filter-more-menu";
import { FilterRangeSections } from "@/features/cards/components/filter-range-sections";
import {
  FilterValueDropdown,
  FilterVariantDropdown,
} from "@/features/cards/components/filter-value-dropdown";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
} from "@/features/cards/components/multi-select-combobox";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import {
  useMoreActiveCount,
  useVisibleFilterDimensions,
} from "@/features/cards/hooks/use-filter-dimensions";
import { filterDimension, OWNED_BUCKETS } from "@/features/cards/lib/filter-dimensions";
import { clusterLabelsFit } from "@/features/tournaments/lib/cluster-label-fit";
import { useEnumOrders } from "@/hooks/use-enums";
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
  /** Units in this set render as inline chips; every other applicable unit lives in the "More" menu. */
  topLevelUnits: ReadonlySet<string>;
  /** The bar hides below `sm` by default; a host without the mobile drawer (collection stats) passes `flex` to stay visible. */
  className?: string;
}

/** Icon-toggle cluster for a small, icon-bearing dimension (Domain, Rarity); filters with a single click, no popover. */
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
  // ToggleGroup's `value` only tracks the include set, so a click is read by
  // diffing the proposed value against `included`, not from `value` membership.
  const onValueChange = (next: string[]) => {
    const added = next.find((value) => !included.includes(value));
    const removed = included.find((value) => !next.includes(value));
    const clicked = added ?? removed;
    if (clicked !== undefined) {
      onCycle(clicked);
    }
  };
  return (
    <ToggleGroup
      multiple
      variant="outline"
      size="sm"
      spacing={0}
      value={included}
      onValueChange={(next) => onValueChange(next as string[])}
      aria-label={`${label} filter`}
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
                    isExcluded && "text-destructive bg-destructive/10 line-through",
                    isZero && !isIncluded && !isExcluded && "opacity-40",
                  )}
                />
              }
            >
              {icon ? (
                <>
                  <span className="relative inline-flex shrink-0 items-center justify-center">
                    <CardIcon src={icon} className="size-4" />
                    {isExcluded && <ExcludedSlash />}
                  </span>
                  {showLabels && (
                    <span>
                      {displayLabel(option)}
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

/** Domain/rarity icons are webp artwork, so `text-destructive` can't tint them; this slash is the icon's excluded-state cue instead. */
function ExcludedSlash() {
  return (
    <span
      aria-hidden="true"
      data-slot="exclude-slash"
      className="bg-destructive outline-background pointer-events-none absolute top-1/2 left-1/2 h-0.5 w-[150%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full outline-1"
    />
  );
}

/** Extra slack so a bar sitting exactly at the fit boundary doesn't flicker. */
const LABEL_FIT_BUFFER = 8;

/** Reads widths only from observer entries after the initial mount pass, never `getBoundingClientRect`, so a filter toggle never forces a layout. */
export function useClusterLabelsFit() {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [labelsFit, setLabelsFit] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return;
    }

    // Kept current from ResizeObserver entries; this is what keeps the steady
    // state off getBoundingClientRect.
    const widths = new WeakMap<Element, number>();
    const observed = new WeakSet<Element>();
    let containerWidth = bar.clientWidth;
    let gap = 0;
    let frame = 0;

    // Clusters are skipped (the strip supplies their expanded widths), as is
    // the strip itself (absolute, out of flow).
    const isInFlowChild = (child: Element): child is HTMLElement =>
      child instanceof HTMLElement &&
      child.dataset.labelFitCluster === undefined &&
      child.dataset.labelFitMeasure === undefined;

    const readBarBox = () => {
      containerWidth = bar.clientWidth;
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed columnGap is "6px"; Number() would yield NaN
      gap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
    };

    const verdict = () => {
      const childWidths: number[] = [];
      for (const child of bar.children) {
        if (isInFlowChild(child)) {
          childWidths.push(widths.get(child) ?? 0);
        }
      }
      const expandedClusterWidths: number[] = [];
      const strip = measureRef.current;
      if (strip) {
        for (const child of strip.children) {
          expandedClusterWidths.push(widths.get(child) ?? 0);
        }
      }
      setLabelsFit(
        clusterLabelsFit({
          containerWidth,
          childWidths,
          expandedClusterWidths,
          gap,
          buffer: LABEL_FIT_BUFFER,
        }),
      );
    };

    // A child appearing or disappearing changes the required width without
    // resizing anything, so this reruns the verdict on the next frame.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(verdict);
    };

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === bar) {
          // Layout is already settled inside the callback, so this read is free.
          readBarBox();
        }
        const box = entry.borderBoxSize[0];
        if (box) {
          widths.set(entry.target, box.inlineSize);
        }
      }
      verdict();
    });

    const observe = (element: Element) => {
      if (!observed.has(element)) {
        observed.add(element);
        resize.observe(element);
      }
    };

    // The WeakSet above keeps each target observed exactly once; re-observing
    // would make the observer re-deliver its size.
    const syncObserved = () => {
      observe(bar);
      for (const child of bar.children) {
        observe(child);
      }
      const strip = measureRef.current;
      if (strip) {
        for (const child of strip.children) {
          observe(child);
        }
      }
    };

    // The verdict starts as `false`; deferring to the observer's first
    // delivery would flash the collapsed state on every page load.
    readBarBox();
    for (const child of bar.children) {
      if (isInFlowChild(child)) {
        widths.set(child, child.getBoundingClientRect().width);
      }
    }
    const mountStrip = measureRef.current;
    if (mountStrip) {
      for (const child of mountStrip.children) {
        widths.set(child, child.getBoundingClientRect().width);
      }
    }
    verdict();

    syncObserved();
    // Subtree: the measuring strip's clusters are a level down, and a chip can
    // swap inner nodes (the exclude slash) as filters change.
    const mutations = new MutationObserver(() => {
      syncObserved();
      schedule();
    });
    mutations.observe(bar, { childList: true, subtree: true });

    return () => {
      resize.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return { barRef, measureRef, labelsFit };
}

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
      <PopoverTrigger
        render={
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
      <PopoverContent align="start" className={cn("w-max max-w-[90vw] min-w-64", contentClassName)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Shared row treatment for the slider/badge rows inside a dropdown chip's
 * popover — each direct child div gets the same hover the More menu's rows have.
 */
const CHIP_POPOVER_ROWS_CLASS =
  "[&>div:focus-within]:bg-muted [&>div:hover]:bg-muted flex flex-col gap-0.5 [&>div]:rounded-md [&>div]:px-1.5 [&>div]:py-1.5";

/** The Copies slider row only renders when the user owns something on this surface (`ownedCountMax > 0`); the buckets always do. */
export function OwnedFilterChip({
  availableFilters,
  filterCounts,
  hiddenSections,
  ownedCountMax,
}: Pick<
  CompactFilterBarProps,
  "availableFilters" | "filterCounts" | "hiddenSections" | "ownedCountMax"
>) {
  const { filterState } = useFilterValues();
  const { toggleArrayFilter } = useFilterActions();
  const showCopiesSlider = ownedCountMax !== undefined && ownedCountMax > 0;
  const copiesActive = filterState.ownedCountMin !== null || filterState.ownedCountMax !== null;
  const activeCount = filterState.owned.length + Number(copiesActive);
  const bucketLabel = (value: string | undefined) =>
    OWNED_BUCKETS.find((bucket) => bucket.value === value)?.label ?? value;
  const summary =
    activeCount === 1
      ? copiesActive
        ? `Copies ${rangeBadgeLabel(
            filterState.ownedCountMin,
            filterState.ownedCountMax,
            0,
            ownedCountMax ?? 0,
          )}`
        : bucketLabel(filterState.owned[0])
      : undefined;
  return (
    <FilterDropdownChip
      label="Owned"
      activeCount={activeCount}
      summary={summary}
      contentClassName="w-80"
    >
      <div className={CHIP_POPOVER_ROWS_CLASS}>
        {OWNED_BUCKETS.map((bucket) => {
          const isSelected = filterState.owned.includes(bucket.value);
          return (
            <Pressable
              key={bucket.value}
              aria-pressed={isSelected}
              onClick={() => toggleArrayFilter("owned", bucket.value)}
              className="hover:bg-muted hover:text-foreground relative flex w-full items-center rounded-md py-1 pr-8 pl-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">{bucket.label}</span>
              {isSelected && (
                <span className="absolute right-2 flex size-4 items-center justify-center">
                  <CheckIcon className="size-4" />
                </span>
              )}
            </Pressable>
          );
        })}
        {showCopiesSlider && (
          <FilterRangeSections
            scope="copies"
            availableFilters={availableFilters}
            filterCounts={filterCounts}
            hiddenSections={hiddenSections}
            ownedCountMax={ownedCountMax}
            labelClassName="text-inherit text-sm font-normal"
          />
        )}
      </div>
    </FilterDropdownChip>
  );
}

/** Mirrors the section guards in `filter-panel-content.tsx`; keep the two in sync when adding or removing a filter dimension. */
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
  const { cycleArrayFilter, toggleStandard, clearAllFilters } = useFilterActions();
  const visibleDimensions = useVisibleFilterDimensions({
    availableFilters,
    availableLanguages,
    hiddenSections,
    visibleCustomTagCategories,
    ownedCountMax,
  });
  const shows = (key: string) =>
    visibleDimensions.has(key) && topLevelUnits.has(filterDimension(key).unit);
  // Standard and Owned each render their own bar-level chip above; excluded
  // here so neither is drawn twice by the trailing chip sections.
  const chipSectionUnits = new Set(
    [...topLevelUnits].filter((unit) => unit !== "standard" && unit !== "owned"),
  );
  const { barRef, measureRef, labelsFit } = useClusterLabelsFit();
  const domainCluster = (showLabels: boolean) =>
    shows("domains") ? (
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
    shows("rarities") ? (
      <FilterIconCluster
        label="Rarity"
        options={availableFilters.rarities}
        included={filterState.rarities}
        excluded={filterState.raritiesEx}
        onCycle={(value) => cycleArrayFilter("rarities", "raritiesEx", value)}
        iconPath={(value) => getFilterIconPath("rarities", value)}
        displayLabel={(value) => enumLabel(labels.rarities, value)}
        counts={filterCounts?.rarities}
        showLabels={showLabels}
      />
    ) : null;

  const showArtVariantSection = shows("artVariants");
  const showFinishSection = shows("finishes");
  const showVariantMenu = showArtVariantSection || showFinishSection;

  const signedInVariantMenu = shows("signed") && showArtVariantSection;
  const overnumberedInVariantMenu = shows("overnumbered") && showArtVariantSection;

  const showStats = shows("energy") || shows("might") || shows("power");

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

  const [firstStatRange, secondStatRange] = activeStatRanges;
  const singleStatSummary =
    firstStatRange && !secondStatRange
      ? `${firstStatRange.label} ${rangeBadgeLabel(
          firstStatRange.min,
          firstStatRange.max,
          firstStatRange.bounds.min,
          firstStatRange.bounds.max,
        )}`
      : undefined;

  const showPriceChip = shows("price");
  const showOwnedChip = shows("owned");
  const priceActive = filterState.priceMin !== null || filterState.priceMax !== null;
  const priceSummary = priceActive
    ? `Price ${rangeBadgeLabel(
        filterState.priceMin,
        filterState.priceMax,
        availableFilters.price.min,
        availableFilters.price.max,
      )}`
    : undefined;

  const moreActiveCount = useMoreActiveCount(topLevelUnits);

  const dropdownProps = { availableFilters, availableLanguages, setDisplayLabel, filterCounts };

  return (
    <TooltipProvider>
      <div
        ref={barRef}
        className={cn("relative mb-3 hidden flex-wrap items-center gap-1.5 sm:flex", className)}
      >
        {shows("languages") && (
          <FilterValueDropdown dimension="languages" triggerStyle="button" {...dropdownProps} />
        )}
        {shows("sets") && (
          <FilterValueDropdown dimension="sets" triggerStyle="button" {...dropdownProps} />
        )}
        {domainCluster(labelsFit)}
        {rarityCluster(labelsFit)}
        {/* The clusters as they'd render with labels on; used only to measure the width labels would need. */}
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
        {shows("types") && (
          <FilterValueDropdown dimension="types" triggerStyle="button" {...dropdownProps} />
        )}
        {shows("superTypes") && (
          <FilterValueDropdown dimension="superTypes" triggerStyle="button" {...dropdownProps} />
        )}
        {showVariantMenu && (
          <FilterVariantDropdown
            triggerStyle="button"
            availableFilters={availableFilters}
            filterCounts={filterCounts}
            showArtVariant={showArtVariantSection}
            showFinish={showFinishSection}
            showOvernumberedFlag={overnumberedInVariantMenu}
            showSignedFlag={signedInVariantMenu}
            fitContent
          />
        )}
        {shows("standard") && (
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
            <div className={CHIP_POPOVER_ROWS_CLASS}>
              <FilterRangeSections
                scope="stats"
                availableFilters={availableFilters}
                filterCounts={filterCounts}
                hiddenSections={hiddenSections}
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        <FilterChipSections
          availableFilters={availableFilters}
          hiddenSections={hiddenSections}
          visibleCustomTagCategories={visibleCustomTagCategories}
          filterCounts={filterCounts}
          units={chipSectionUnits}
          variant="inline"
        />
        {showOwnedChip && (
          <OwnedFilterChip
            availableFilters={availableFilters}
            filterCounts={filterCounts}
            hiddenSections={hiddenSections}
            ownedCountMax={ownedCountMax}
          />
        )}
        {showPriceChip && (
          <FilterDropdownChip
            label="Price"
            activeCount={priceActive ? 1 : 0}
            summary={priceSummary}
            contentClassName="w-80"
          >
            <div className={CHIP_POPOVER_ROWS_CLASS}>
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
