import type { AvailableFilters, FilterCounts, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import type { ReactNode } from "react";

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
      <FilterRangeSections availableFilters={availableFilters} />
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
      ? "Missing"
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
          {!hiddenSections?.has("owned") && (
            <Badge
              variant={filterState.owned === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={() => toggleOwned(allowIncomplete)}
            >
              {ownedLabel}
            </Badge>
          )}
          {availableFilters.hasSigned && (
            <Badge
              variant={filterState.signed === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleSigned}
            >
              {filterState.signed === false ? "Not Signed" : "Signed"}
            </Badge>
          )}
          {availableFilters.hasAnyMarker && (
            <Badge
              variant={filterState.promo === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={togglePromo}
            >
              {filterState.promo === false ? "Not Promo" : "Promo"}
            </Badge>
          )}
          {availableFilters.hasBanned && (
            <Badge
              variant={filterState.banned === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleBanned}
            >
              {filterState.banned === false ? "Not Banned" : "Banned"}
            </Badge>
          )}
          {availableFilters.hasErrata && (
            <Badge
              variant={filterState.errata === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleErrata}
            >
              {filterState.errata === false ? "No Errata" : "Errata"}
            </Badge>
          )}
        </FilterSection>
      )}
    </>
  );
}

const HAS_NULL_KEY: Partial<Record<RangeKey, keyof AvailableFilters>> = {
  energy: "hasNullEnergy",
  might: "hasNullMight",
  power: "hasNullPower",
};

export function FilterRangeSections({
  availableFilters,
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
        const available = availableFilters[key];
        const hasNullKey = HAS_NULL_KEY[key];
        const hasNone = hasNullKey ? (availableFilters[hasNullKey] as boolean) : false;
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

  return (
    <div className="flex items-center gap-2">
      {/* Label */}
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      {/* Slider with values */}
      <div className="flex flex-1 items-center gap-1">
        {/* Min value */}
        <span className="text-2xs text-muted-foreground shrink-0 text-right tabular-nums">
          {fmtNone(resolvedMin)}
        </span>
        {/* Slider */}
        <Slider
          min={sMin}
          max={sMax}
          step={sStep}
          value={[toSlider(resolvedMin), toSlider(resolvedMax)]}
          aria-label={`${label} range`}
          onValueChange={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const [newMin, newMax] = arr;
            const atLeftEdge = newMin === sMin;
            const atRightEdge = newMax === sMax;
            if (atLeftEdge && atRightEdge) {
              onChange(null, null);
            } else {
              const realMin = fromSlider(newMin ?? sMin);
              const realMax = fromSlider(newMax ?? sMax);
              const minVal = atLeftEdge ? (hasNone ? NONE : null) : realMin;
              const maxVal = atRightEdge ? null : realMax;
              onChange(minVal, maxVal);
            }
          }}
          className="flex-1"
        />
        {/* Max value */}
        <span className="text-2xs text-muted-foreground shrink-0 tabular-nums">
          {fmtNone(resolvedMax)}
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
