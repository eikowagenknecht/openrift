import type { AvailableFilters } from "@openrift/shared/filters-available";
import type { RangeKey } from "@openrift/shared/types/search";
import { NONE } from "@openrift/shared/types/search";
import { CircleSlashIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Slider } from "@/components/ui/slider";
import type { FilterPanelContentProps } from "@/features/cards/components/filter-panel-content";
import { useFilterActions, useFilterValues } from "@/features/cards/hooks/use-card-filters";
import { useScopeEffect } from "@/hooks/use-scope-effect";
import { compactFormatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const LOG_STEPS = 1000;

function valueToSliderPos(value: number, rangeMin: number, rangeMax: number): number {
  if (rangeMax <= rangeMin) {
    return 0;
  }
  const logMin = Math.log1p(rangeMin);
  const logMax = Math.log1p(rangeMax);
  return Math.round(((Math.log1p(value) - logMin) / (logMax - logMin)) * LOG_STEPS);
}

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
  // Only consulted in the default scope="all" mode; explicit scopes already picked their rows.
  units?: ReadonlySet<string>;
  scope?: "all" | "stats" | "price" | "copies";
  labelClassName?: string;
}) {
  const { ranges, filterState } = useFilterValues();
  const { setRange, setOwnedCountRange } = useFilterActions();
  const favoriteMarketplace = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");

  // availableFilters[key] price already reflects the favourite marketplace via getAvailableFilters' getPrice.
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
  const showCopies = (scope === "all" || scope === "copies") && showRangeUnit("owned");

  const valueClassName = scope === "stats" ? "w-4" : undefined;

  return (
    <>
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
        const facetedRange = filterCounts?.ranges[key];
        const available = facetedRange ?? availableFilters[key];
        const hasNullKey = HAS_NULL_KEY[key];
        const facetedHasNone =
          key !== "price" && facetedRange
            ? (facetedRange as { hasNullStat: boolean }).hasNullStat
            : undefined;
        const hasNone =
          facetedHasNone ?? (hasNullKey ? (availableFilters[hasNullKey] as boolean) : false);
        // Non-price ranges always render (disabled if degenerate); price hides
        // entirely when no priced cards exist in the catalog.
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
  valueClassName?: string;
}) {
  const sliderMin = hasNone ? NONE : availableMin;
  const defaultMin = hasNone ? NONE : availableMin;
  const resolvedMin = selectedMin ?? defaultMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;
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

  const sMin = logarithmic ? 0 : sliderMin;
  const sMax = logarithmic ? LOG_STEPS : availableMax;
  const sStep = logarithmic ? 1 : step;
  // min===max would divide by zero in Base UI's thumb-position math; render disabled
  // instead. Logarithmic sliders use a fixed scale, so judge degeneracy on availableMin/Max.
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
  // URL writes are debounced: keyboard auto-repeat fires onValueCommitted ~30/sec,
  // which trips the browser's history.replaceState rate limit and wedges the route.
  const [dragValue, setDragValue] = useState<[number, number] | null>(null);
  // A pointer drag commits only on release; committing mid-drag reflows the filter
  // chrome under the pointer and drags the thumb away from where the user aimed.
  const isDraggingRef = useRef(false);
  const displayValue: [number, number] = isDegenerate
    ? [renderSliderMin, renderSliderMax]
    : (dragValue ?? [urlMin, urlMax]);
  const displayMin = dragValue ? fromSlider(dragValue[0]) : resolvedMin;
  const displayMax = dragValue ? fromSlider(dragValue[1]) : resolvedMax;

  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<[number, number] | null>(null);

  // Only clear once the URL has caught up and no input is queued, or a keystroke
  // during commit propagation would snap the thumb back to the prior value.
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
      <p className={cn("text-muted-foreground w-18 text-xs font-medium", labelClassName)}>
        {label}
      </p>
      <div className="flex flex-1 items-center gap-1">
        <span
          className={cn(
            "text-2xs text-muted-foreground shrink-0 text-right tabular-nums",
            valueClassName,
          )}
        >
          {renderValue(displayMin)}
        </span>
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
        <span
          className={cn("text-2xs text-muted-foreground shrink-0 tabular-nums", valueClassName)}
        >
          {renderValue(displayMax)}
        </span>
      </div>
    </div>
  );
}
