import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { FilterChipSections } from "@/components/filters/filter-chip-sections";
import { FilterCustomizeControl } from "@/components/filters/filter-customize-control";
import { FlagBadge } from "@/components/filters/filter-flag-badge";
import { FilterMoreMenu } from "@/components/filters/filter-more-menu";
import { FilterRangeSections } from "@/components/filters/filter-range-sections";
import {
  FilterValueDropdown,
  FilterVariantDropdown,
} from "@/components/filters/filter-value-dropdown";
import {
  FILTER_TRIGGER_ACTIVE_CLASS,
  FILTER_TRIGGER_CLASS,
} from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMoreActiveCount, useVisibleFilterDimensions } from "@/hooks/use-filter-dimensions";
import { clusterLabelsFit } from "@/lib/cluster-label-fit";
import { formatDomainFilterLabel } from "@/lib/domain";
import { filterDimension, OWNED_BUCKETS } from "@/lib/filter-dimensions";
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
                    // the text (the icon gets its own slash, see ExcludedSlash).
                    // Text + background tint suffice — no extra ring/border.
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

/**
 * The diagonal bar drawn across an excluded option's icon — the icon's
 * counterpart to the strikethrough on excluded text. Domain and rarity icons
 * are webp artwork, so `text-destructive` can't tint them, and with the cluster
 * labels hidden there is no text to strike: without this the only cue left is a
 * 10% red wash, near-indistinguishable from the included state's grey fill. The
 * background-coloured outline keeps the line legible over a full-colour gem.
 * @returns The slash overlay.
 */
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

/**
 * Decides whether the Domain/Rarity clusters can show their inline labels
 * without wrapping the bar onto a second row. The required width is computed
 * from the bar's in-flow children (skipping the clusters) plus the clusters'
 * expanded widths taken from an invisible measuring strip — inputs that don't
 * depend on the current label state, so the decision can't oscillate.
 *
 * Set up once on mount and driven entirely by observers afterwards. Widths come
 * out of `ResizeObserver` entries rather than `getBoundingClientRect`, so a
 * filter toggle never forces a document layout: a chip whose count text changes
 * width reports its new size in the observer callback, and chips that appear or
 * disappear are picked up by the `MutationObserver`. Only the mount pass reads
 * the DOM directly. The setState bails when the boolean is unchanged, so
 * re-measures settle immediately.
 *
 * The earlier version re-ran on every render and re-measured every child
 * synchronously. Because a filter change renders the bar up to three times
 * (urgent pass, deferred counts pass) that meant ~60 forced layouts per toggle,
 * which measured as the single most expensive part of a filter click — 93ms of
 * a 154ms interaction on a throttled mid-range phone.
 *
 * Exported for the deck list's filter row, which runs the same icon cluster and
 * so needs the same verdict.
 *
 * @returns Refs for the bar and the measuring strip, plus the fit verdict.
 */
export function useClusterLabelsFit() {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [labelsFit, setLabelsFit] = useState(false);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return;
    }

    // Border-box widths, kept current from ResizeObserver entries. Reading the
    // verdict's inputs out of this map is what keeps the steady state off
    // getBoundingClientRect.
    const widths = new WeakMap<Element, number>();
    const observed = new WeakSet<Element>();
    let containerWidth = bar.clientWidth;
    let gap = 0;
    let frame = 0;

    // The clusters are skipped (the strip supplies their expanded widths), as
    // is the strip itself (absolute, out of flow).
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
    // resizing anything, so that path re-runs the verdict on the next frame
    // (coalesced — React re-renders the bar several times per filter change).
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(verdict);
    };

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === bar) {
          // Layout is already settled inside the callback, so these reads are
          // free rather than a forced reflow.
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

    // Re-observing an element already in the set would make the observer
    // re-deliver its size, so the WeakSet above keeps each target observed
    // exactly once. Removed nodes simply stop reporting.
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

    // The mount pass measures directly: the verdict starts as `false`
    // (collapsed labels) and the observer's first delivery is a frame away, so
    // deferring it flashes the collapsed state on every page load.
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
    // Subtree, because the measuring strip's clusters are a level down and a
    // chip can swap inner nodes (the exclude slash) as filters change.
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

/**
 * The Owned chip: both halves of the "owned" placement unit — the playset
 * buckets as toggle badges and the Copies range slider — in one popover, the
 * way the Stats chip spans its three sliders. One promoted unit, one chip.
 * The slider row only renders when the user owns something on this surface
 * (`ownedCountMax > 0`); the buckets always do (surfaces where ownership is
 * meaningless hide the whole unit via `hiddenSections`).
 * @returns The Owned dropdown chip.
 */
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
  // Fixed 4-entry vocabulary; the fallback only guards a hand-edited URL value.
  const bucketLabel = (value: string) =>
    OWNED_BUCKETS.find((bucket) => bucket.value === value)?.label ?? value;
  // Mirror the value dropdowns: a single active entry names itself on the
  // trigger ("Full Playset", "Copies ≥1") instead of a bare "Owned (1)".
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
        {/* Bucket rows styled like the value dropdowns' option rows (label
            left, check right) — the bar's popovers speak list rows, not the
            expanded panel's badge pills. */}
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
  const { cycleArrayFilter, toggleStandard, clearAllFilters } = useFilterActions();
  const visibleDimensions = useVisibleFilterDimensions({
    availableFilters,
    availableLanguages,
    hiddenSections,
    visibleCustomTagCategories,
    ownedCountMax,
  });
  // One predicate per dimension, from the registry: the axis has content the
  // surface hasn't hidden, and its placement unit is promoted to the bar. The
  // Variant and Stats units resolve through their own axes, so a per-axis hide
  // (artVariants, energy, …) still works.
  const shows = (key: string) =>
    visibleDimensions.has(key) && topLevelUnits.has(filterDimension(key).unit);
  // Standard's promoted chip renders bar-level right after Variant (canonical
  // order), and Owned renders bar-level as the merged buckets-plus-Copies chip;
  // keep both out of the trailing chip sections so neither is drawn twice.
  const chipSectionUnits = new Set(
    [...topLevelUnits].filter((unit) => unit !== "standard" && unit !== "owned"),
  );
  // The Domain/Rarity clusters expand to icon + label + count whenever that
  // still fits on one row; the same builders feed the visible bar and the
  // invisible measuring strip the fit check reads.
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
        displayLabel={(value) => labels.rarities[value]}
        counts={filterCounts?.rarities}
        showLabels={showLabels}
      />
    ) : null;

  const showArtVariantSection = shows("artVariants");
  const showFinishSection = shows("finishes");
  const showVariantMenu = showArtVariantSection || showFinishSection;

  const signedInVariantMenu = shows("signed") && showArtVariantSection;
  const overnumberedInVariantMenu = shows("overnumbered") && showArtVariantSection;

  // Stats: the printed gameplay sliders only (Energy/Might/Power, always shown
  // unless hidden). Price and Copies are value/collection ranges under their
  // own placement units, each with its own chip when promoted.
  const showStats = shows("energy") || shows("might") || shows("power");

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

  // Price gets its own dropdown chip when promoted; otherwise it rides as a
  // slider row in the "More" menu. Owned's promoted chip (buckets + the Copies
  // slider, one chip for the one unit) is OwnedFilterChip below.
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

  // The "More" trigger's count: every active selection whose unit lives in the
  // menu (including exclude companions and folded presence flags, ADR-034).
  // Promoted units surface their counts on their own chips instead.
  const moreActiveCount = useMoreActiveCount(topLevelUnits);

  // Each cycling dropdown's options, state and counts live in the shared
  // dimension registry, so the bar's chips and the More menu's rows come from
  // one definition per axis (a single row per value carries both the include
  // and exclude state, ADR-034).
  const dropdownProps = { availableFilters, availableLanguages, setDisplayLabel, filterCounts };

  return (
    <TooltipProvider>
      {/* Order mirrors the expanded panel: Language, Set, Domain, Rarity, Type,
          Supertype, Variant (Art Variant + Finish + Signed), Stats, More. */}
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
            // Grouped Variant dropdown is short; size it to its content and
            // only scroll when the viewport is tight, like a menu.
            fitContent
          />
        )}
        {/* Standard sits right after Variant in the canonical order, so its
            promoted chip renders here rather than with the trailing chip
            sections (which are excluded from rendering it below). */}
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
                // Keep the slider labels consistent with the "More" menu's
                // sliders (text-sm, full-strength, not the panel's muted
                // text-xs gutter).
                labelClassName="text-inherit text-sm font-normal"
              />
            </div>
          </FilterDropdownChip>
        )}
        {/* Promoted chip units (markers, flags, …) render inline with the same
            button language; Owned and Price get their own chips mirroring the
            Stats chip. The More menu hosts everything demoted (and nulls
            itself out when nothing lives there). */}
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
