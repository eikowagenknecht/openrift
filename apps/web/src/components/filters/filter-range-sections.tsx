import type { AvailableFilters, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import { CircleSlashIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { FilterPanelContentProps } from "@/components/filters/filter-panel-content";
import { Slider } from "@/components/ui/slider";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { compactFormatterForMarketplace } from "@/lib/format";
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
  units,
}: Omit<FilterPanelContentProps, "setDisplayLabel"> & {
  /**
   * Placement units to render here (see `lib/filter-sections.ts`): the stat
   * sliders belong to "stats", Price to "price", Copies to "owned". Only
   * consulted in the default `scope="all"` mode — explicit scopes (the Stats
   * chip, the More menu's blocks) already picked their rows.
   */
  units?: ReadonlySet<string>;
  /**
   * Which range rows to render. "stats" = the printed gameplay numbers
   * (Energy/Power/Might) only; "price" / "copies" = just that one row (the
   * compact bar's Owned and Price chips and the More menu's themed blocks each
   * place their own); "all" (default) = every range, as the vertical panel
   * shows them. The compact bar splits them so its "Stats" chip stays honest.
   */
  scope?: "all" | "stats" | "price" | "copies";
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
  const showRangeUnit = (unit: string) => scope !== "all" || units === undefined || units.has(unit);
  const sections: RangeSection[] =
    scope === "stats"
      ? STAT_RANGE_SECTIONS
      : scope === "price"
        ? [priceSection]
        : scope === "copies"
          ? []
          : [
              ...(showRangeUnit("stats") ? STAT_RANGE_SECTIONS : []),
              ...(showRangeUnit("price") ? [priceSection] : []),
            ];
  // Copies belongs to the "owned" placement unit alongside the Owned bucket
  // row, never to the gameplay stats or the price-only scope. In the full
  // panel it renders FIRST — the Owned row is the last chip section above
  // these sliders, so leading with Copies keeps the unit's two halves adjacent.
  const showCopies = (scope === "all" || scope === "copies") && showRangeUnit("owned");

  // Stat values (Energy/Power/Might) never exceed two digits, so the compact
  // Stats menu narrows the value columns to a single-digit-ish gutter; the
  // text-right min / text-left max keep the digits tight to the slider.
  const valueClassName = scope === "stats" ? "w-4" : undefined;

  return (
    <>
      {/* Copies owned — a web-app-only range gated the same as the Owned bucket
          row. The bound is the user's actual maximum, so it only renders for
          logged-in users who own something on this surface. */}
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
  // layout but is non-interactive. Logarithmic sliders always run on the fixed
  // 0–LOG_STEPS scale (sMin/sMax never collapse), so degeneracy must be judged
  // against the real faceted bounds instead.
  const isDegenerate = logarithmic ? availableMax <= availableMin : sMax <= sMin;
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
  // A pointer drag commits only when the thumb is released. Committing mid-drag
  // re-renders the filter chrome (an active-filter chip appears, faceted bounds
  // move), which reflows the bar under the pointer and drags the thumb somewhere
  // the user never aimed for. Keyboard and track-press changes keep the debounce
  // above, since they have no pointer to displace.
  const isDraggingRef = useRef(false);
  const displayValue: [number, number] = isDegenerate
    ? [renderSliderMin, renderSliderMax]
    : (dragValue ?? [urlMin, urlMax]);
  const displayMin = dragValue ? fromSlider(dragValue[0]) : resolvedMin;
  const displayMax = dragValue ? fromSlider(dragValue[1]) : resolvedMax;

  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<[number, number] | null>(null);

  // Drop the local mirror only when the URL has caught up AND no further input is queued — otherwise a keystroke arriving during commit propagation would briefly snap the thumb back to the previously-committed value.
  useScopeEffect(`${urlMin} ${urlMax} ${dragValue?.join(",") ?? ""}`, () => {
    if (
      dragValue !== null &&
      !isDraggingRef.current &&
      commitTimerRef.current === null &&
      pendingCommitRef.current === null
    ) {
      setDragValue(null);
    }
  });

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
          onValueChange={(values, details) => {
            const arr = Array.isArray(values) ? values : [values];
            const next: [number, number] = [arr[0] ?? sMin, arr[1] ?? sMax];
            setDragValue(next);
            if (details.reason === "drag") {
              isDraggingRef.current = true;
              return;
            }
            scheduleCommit(next);
          }}
          onValueCommitted={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const next: [number, number] = [arr[0] ?? sMin, arr[1] ?? sMax];
            isDraggingRef.current = false;
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
