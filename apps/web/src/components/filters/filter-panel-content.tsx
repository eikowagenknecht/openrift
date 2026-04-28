import type { AvailableFilters, FilterCounts, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { formatDomainFilterLabel } from "@/lib/domain";
import { formatPriceIntegerForMarketplace } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
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

interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** Override selected values for array filters (e.g. zone presets in the deck builder). */
  filterOverrides?: Partial<Record<string, string[]>>;
  /**
   * Per-dimension faceted counts. When present, each badge shows its match
   * count and zero-count options are dimmed. Omit to fall back to plain
   * unfaceted badges (deck builder, collection grid).
   */
  filterCounts?: FilterCounts;
}

export function FilterPanelContent({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  filterOverrides,
  filterCounts,
}: FilterPanelContentProps) {
  return (
    <>
      <FilterBadgeSections
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={hiddenSections}
        filterOverrides={filterOverrides}
        filterCounts={filterCounts}
      />
      <FilterRangeSections availableFilters={availableFilters} filterCounts={filterCounts} />
    </>
  );
}

export function FilterBadgeSections({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  filterOverrides,
  filterCounts,
}: FilterPanelContentProps) {
  const { labels } = useEnumOrders();
  const { filterState, view } = useFilterValues();
  const { toggleOwned, toggleArrayFilter, toggleSigned, togglePromo, toggleBanned, toggleErrata } =
    useFilterActions();
  const allowIncomplete = view !== "printings";
  const ownedLabel =
    filterState.owned === "missing"
      ? "No Playset"
      : filterState.owned === "incomplete"
        ? "Incomplete"
        : "Owned";
  const languageLabels = useLanguageLabels();
  // Use overrides when URL state is empty (zone presets that aren't in the URL)
  const selected = (key: keyof typeof filterState) => {
    const urlValue = filterState[key];
    const arr = Array.isArray(urlValue) ? urlValue : [];
    return arr.length > 0 ? arr : (filterOverrides?.[key] ?? []);
  };
  return (
    <>
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => toggleArrayFilter("sets", v)}
        displayLabel={setDisplayLabel}
        secondaryOptions={availableFilters.supplementalSets}
        counts={filterCounts?.sets}
        wide
      />
      {!hiddenSections?.has("domains") && (
        <FilterSection
          label="Domain"
          options={availableFilters.domains}
          selected={selected("domains")}
          onToggle={(v) => toggleArrayFilter("domains", v)}
          iconPath={(v) => getFilterIconPath("domains", v)}
          displayLabel={formatDomainFilterLabel}
          counts={filterCounts?.domains}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => toggleArrayFilter("rarities", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
        counts={filterCounts?.rarities}
      />
      {!hiddenSections?.has("types") && (
        <FilterSection
          label="Type"
          options={availableFilters.types}
          selected={selected("types")}
          onToggle={(v) => toggleArrayFilter("types", v)}
          iconPath={(v) => getFilterIconPath("types", v)}
          counts={filterCounts?.types}
        />
      )}
      {availableFilters.superTypes.length > 0 && !hiddenSections?.has("superTypes") && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={selected("superTypes")}
          onToggle={(v) => toggleArrayFilter("superTypes", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
          counts={filterCounts?.superTypes}
        />
      )}
      {availableFilters.artVariants.length > 1 && (
        <FilterSection
          label="Art Variant"
          options={availableFilters.artVariants}
          selected={filterState.artVariants}
          onToggle={(v) => toggleArrayFilter("artVariants", v)}
          displayLabel={(v) => labels.artVariants[v] ?? v}
          counts={filterCounts?.artVariants}
        />
      )}
      {availableFilters.finishes.length > 1 && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          onToggle={(v) => toggleArrayFilter("finishes", v)}
          displayLabel={(v) => labels.finishes[v] ?? v}
          counts={filterCounts?.finishes}
        />
      )}
      {availableLanguages && availableLanguages.length > 1 && (
        <FilterSection
          label="Language"
          options={availableLanguages}
          selected={filterState.languages}
          onToggle={(v) => toggleArrayFilter("languages", v)}
          displayLabel={(code) => languageLabels[code] ?? code}
          counts={filterCounts?.languages}
        />
      )}
      {(!hiddenSections?.has("owned") ||
        availableFilters.hasSigned ||
        availableFilters.hasAnyMarker ||
        availableFilters.hasBanned ||
        availableFilters.hasErrata) && (
        <FilterSection label="More">
          {availableFilters.hasSigned && (
            <FlagBadge
              label={filterState.signed === false ? "Not Signed" : "Signed"}
              isActive={filterState.signed !== null}
              count={filterCounts?.flags.signed}
              onClick={toggleSigned}
            />
          )}
          {availableFilters.hasAnyMarker && (
            <FlagBadge
              label={filterState.promo === false ? "Not Promo" : "Promo"}
              isActive={filterState.promo !== null}
              count={filterCounts?.flags.promo}
              onClick={togglePromo}
            />
          )}
          {availableFilters.hasBanned && (
            <FlagBadge
              label={filterState.banned === false ? "Not Banned" : "Banned"}
              isActive={filterState.banned !== null}
              count={filterCounts?.flags.banned}
              onClick={toggleBanned}
            />
          )}
          {availableFilters.hasErrata && (
            <FlagBadge
              label={filterState.errata === false ? "No Errata" : "Errata"}
              isActive={filterState.errata !== null}
              count={filterCounts?.flags.errata}
              onClick={toggleErrata}
            />
          )}
          {!hiddenSections?.has("owned") && (
            <FlagBadge
              label={ownedLabel}
              isActive={filterState.owned !== null}
              count={filterCounts?.flags.owned}
              onClick={() => toggleOwned(allowIncomplete)}
            />
          )}
        </FilterSection>
      )}
    </>
  );
}

function FlagBadge({
  label,
  isActive,
  count,
  onClick,
}: {
  label: string;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}) {
  const isZero = count !== undefined && count === 0;
  return (
    <Badge
      variant={isActive ? "default" : "outline"}
      className={cn("cursor-pointer", isZero && !isActive && "opacity-40")}
      onClick={onClick}
    >
      {label}
      {count !== undefined && <span className="ml-1 tabular-nums opacity-60">{count}</span>}
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
}: Omit<FilterPanelContentProps, "setDisplayLabel">) {
  const { ranges } = useFilterValues();
  const { setRange } = useFilterActions();
  const favoriteMarketplace = useDisplayStore((s) => s.marketplaceOrder[0] ?? "cardtrader");

  // The price section uses a marketplace-aware currency formatter so EUR
  // users see "5 €" instead of "$5". The available range itself already
  // reflects the favourite marketplace via getAvailableFilters' getPrice.
  const sections: RangeSection[] = [
    ...STAT_RANGE_SECTIONS,
    {
      key: "price",
      label: "Price",
      logarithmic: true,
      formatValue: formatPriceIntegerForMarketplace(favoriteMarketplace),
    },
  ];

  return (
    <>
      {sections.map(({ key, label, ...rest }) => {
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
        const show =
          key === "price" ? available.max > 0 : hasNone || available.min !== available.max;
        if (!show) {
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
}) {
  const sliderMin = hasNone ? NONE : availableMin;
  const defaultMin = hasNone ? NONE : availableMin;
  const resolvedMin = selectedMin ?? defaultMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;
  const fmtNone = (value: number) => (value === NONE ? "None" : fmt(value));

  // In logarithmic mode the slider operates on a linear 0–LOG_STEPS scale and
  // we convert between slider positions and real values with log/exp.
  const sMin = logarithmic ? 0 : sliderMin;
  const sMax = logarithmic ? LOG_STEPS : availableMax;
  const sStep = logarithmic ? 1 : step;
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
  const displayValue: [number, number] = dragValue ?? [urlMin, urlMax];
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
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      {/* Slider with values */}
      <div className="flex flex-1 items-center gap-1">
        {/* Min value */}
        <span className="text-2xs text-muted-foreground shrink-0 text-right tabular-nums">
          {fmtNone(displayMin)}
        </span>
        {/* Slider */}
        <Slider
          min={sMin}
          max={sMax}
          step={sStep}
          value={displayValue}
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
        {/* Max value */}
        <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
          {fmtNone(displayMax)}
        </span>
      </div>
    </div>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
  iconPath,
  displayLabel,
  secondaryOptions,
  counts,
  wide,
  children,
}: {
  label: string;
  children?: ReactNode;
  options?: string[];
  selected?: string[];
  onToggle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  secondaryOptions?: ReadonlySet<string>;
  counts?: Map<string, number>;
  /** Span the full row in any multi-column parent grid. */
  wide?: boolean;
}) {
  if (!children && (!options || options.length === 0)) {
    return null;
  }

  return (
    <div className={cn("flex min-w-0 gap-2", wide && "lg:col-span-2")}>
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      <div className="flex flex-1 flex-wrap gap-1">
        {children ??
          options?.map((option) => {
            const icon = iconPath?.(option);
            const isSelected = selected?.includes(option);
            const isSecondary = secondaryOptions?.has(option);
            const count = counts?.get(option);
            const isZero = counts !== undefined && (count ?? 0) === 0;
            return (
              <Badge
                key={option}
                variant={isSelected ? "default" : "outline"}
                className={cn(
                  "cursor-pointer",
                  isSecondary && !isSelected && "opacity-65",
                  isZero && !isSelected && "opacity-40",
                )}
                onClick={() => onToggle?.(option)}
              >
                {icon && <CardIcon src={icon} />}
                {displayLabel ? displayLabel(option) : option}
                {count !== undefined && (
                  <span className="ml-1 tabular-nums opacity-60">{count}</span>
                )}
              </Badge>
            );
          })}
      </div>
    </div>
  );
}
