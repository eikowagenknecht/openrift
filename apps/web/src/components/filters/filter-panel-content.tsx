import type { AvailableFilters, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useEnumOrders } from "@/hooks/use-enums";
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
  { key: "might", label: "Might" },
  { key: "power", label: "Power" },
];

interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
}

export function FilterPanelContent({
  availableFilters,
  setDisplayLabel,
  hiddenSections,
}: FilterPanelContentProps) {
  return (
    <>
      <FilterBadgeSections
        availableFilters={availableFilters}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={hiddenSections}
      />
      <FilterRangeSections availableFilters={availableFilters} />
    </>
  );
}

export function FilterBadgeSections({
  availableFilters,
  setDisplayLabel,
  hiddenSections,
}: FilterPanelContentProps) {
  const { labels } = useEnumOrders();
  const { filterState } = useFilterValues();
  const { toggleOwned, toggleArrayFilter, toggleSigned, togglePromo, toggleBanned, toggleErrata } =
    useFilterActions();
  return (
    <>
      {!hiddenSections?.has("owned") && (
        <FilterSection label="Owned">
          <Badge
            variant={filterState.owned === null ? "outline" : "default"}
            className="cursor-pointer"
            onClick={toggleOwned}
          >
            {filterState.owned === "false" ? "Missing" : "Owned"}
          </Badge>
        </FilterSection>
      )}
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => toggleArrayFilter("sets", v)}
        displayLabel={setDisplayLabel}
        secondaryOptions={availableFilters.supplementalSets}
      />
      {!hiddenSections?.has("domains") && (
        <FilterSection
          label="Domain"
          options={availableFilters.domains}
          selected={filterState.domains}
          onToggle={(v) => toggleArrayFilter("domains", v)}
          iconPath={(v) => getFilterIconPath("domains", v)}
          displayLabel={formatDomainFilterLabel}
        />
      )}
      {!hiddenSections?.has("types") && (
        <FilterSection
          label="Type"
          options={availableFilters.types}
          selected={filterState.types}
          onToggle={(v) => toggleArrayFilter("types", v)}
          iconPath={(v) => getFilterIconPath("types", v)}
        />
      )}
      {availableFilters.superTypes.length > 0 && !hiddenSections?.has("superTypes") && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={filterState.superTypes}
          onToggle={(v) => toggleArrayFilter("superTypes", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => toggleArrayFilter("rarities", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
      />
      {availableFilters.artVariants.length > 1 && (
        <FilterSection
          label="Art Variant"
          options={availableFilters.artVariants}
          selected={filterState.artVariants}
          onToggle={(v) => toggleArrayFilter("artVariants", v)}
          displayLabel={(v) => labels.artVariants[v] ?? v}
        />
      )}
      {availableFilters.finishes.length > 1 && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          onToggle={(v) => toggleArrayFilter("finishes", v)}
          displayLabel={(v) => labels.finishes[v] ?? v}
        />
      )}
      {(availableFilters.hasSigned ||
        availableFilters.hasPromo ||
        availableFilters.hasBanned ||
        availableFilters.hasErrata) && (
        <FilterSection label="Special">
          {availableFilters.hasSigned && (
            <Badge
              variant={filterState.signed === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleSigned}
            >
              {filterState.signed === "false" ? "Not Signed" : "Signed"}
            </Badge>
          )}
          {availableFilters.hasPromo && (
            <Badge
              variant={filterState.promo === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={togglePromo}
            >
              {filterState.promo === "false" ? "Not Promo" : "Promo"}
            </Badge>
          )}
          {availableFilters.hasBanned && (
            <Badge
              variant={filterState.banned === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleBanned}
            >
              {filterState.banned === "false" ? "Not Banned" : "Banned"}
            </Badge>
          )}
          {availableFilters.hasErrata && (
            <Badge
              variant={filterState.errata === null ? "outline" : "default"}
              className="cursor-pointer"
              onClick={toggleErrata}
            >
              {filterState.errata === "false" ? "No Errata" : "Errata"}
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
  const favoriteMarketplace = useDisplayStore((s) => s.marketplaceOrder[0] ?? "tcgplayer");

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
}) {
  if (!children && (!options || options.length === 0)) {
    return null;
  }

  return (
    <div className="flex min-w-0 gap-2">
      <p className="text-muted-foreground w-18 text-xs font-medium">{label}</p>
      <div className="flex flex-1 flex-wrap gap-1">
        {children ??
          options?.map((option) => {
            const icon = iconPath?.(option);
            const isSelected = selected?.includes(option);
            const isSecondary = secondaryOptions?.has(option);
            return (
              <Badge
                key={option}
                variant={isSelected ? "default" : "outline"}
                className={cn("cursor-pointer", isSecondary && !isSelected && "opacity-65")}
                onClick={() => onToggle?.(option)}
              >
                {icon && <CardIcon src={icon} />}
                {displayLabel ? displayLabel(option) : option}
              </Badge>
            );
          })}
      </div>
    </div>
  );
}
