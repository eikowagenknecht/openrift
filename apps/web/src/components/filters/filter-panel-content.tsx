import type { AvailableFilters, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import type { ReactNode } from "react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { formatDomainFilterLabel } from "@/lib/domain";
import { ART_VARIANT_LABELS, FINISH_LABELS } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";

const RANGE_SECTIONS: {
  key: RangeKey;
  label: string;
  step?: number;
  formatValue?: (v: number) => string;
}[] = [
  { key: "energy", label: "Energy" },
  { key: "might", label: "Might" },
  { key: "power", label: "Power" },
  { key: "price", label: "TCG Price", step: 1, formatValue: (v) => `$${v}` },
];

interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
}

export function FilterPanelContent({ availableFilters, setDisplayLabel }: FilterPanelContentProps) {
  return (
    <>
      <FilterBadgeSections availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      <FilterRangeSections availableFilters={availableFilters} />
    </>
  );
}

export function FilterBadgeSections({
  availableFilters,
  setDisplayLabel,
}: FilterPanelContentProps) {
  const { filterState } = useFilterValues();
  const { toggleArrayFilter, toggleSigned, togglePromo } = useFilterActions();
  return (
    <>
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => toggleArrayFilter("sets", v)}
        displayLabel={setDisplayLabel}
      />
      <FilterSection
        label="Domain"
        options={availableFilters.domains}
        selected={filterState.domains}
        onToggle={(v) => toggleArrayFilter("domains", v)}
        iconPath={(v) => getFilterIconPath("domains", v)}
        displayLabel={formatDomainFilterLabel}
      />
      <FilterSection
        label="Type"
        options={availableFilters.types}
        selected={filterState.types}
        onToggle={(v) => toggleArrayFilter("types", v)}
        iconPath={(v) => getFilterIconPath("types", v)}
      />
      {availableFilters.superTypes.length > 0 && (
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
          displayLabel={(v) => ART_VARIANT_LABELS[v] ?? v}
        />
      )}
      {availableFilters.finishes.length > 1 && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          onToggle={(v) => toggleArrayFilter("finishes", v)}
          displayLabel={(v) => FINISH_LABELS[v] ?? v}
        />
      )}
      {(availableFilters.hasSigned || availableFilters.hasPromo) && (
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

  return (
    <>
      {RANGE_SECTIONS.map(({ key, label, ...rest }) => {
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
            {...rest}
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
  formatValue?: (value: number) => string;
}) {
  const sliderMin = hasNone ? NONE : availableMin;
  const defaultMin = hasNone ? NONE : availableMin;
  const resolvedMin = selectedMin ?? defaultMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;
  const fmtNone = (value: number) => (value === NONE ? "None" : fmt(value));

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
          min={sliderMin}
          max={availableMax}
          step={step}
          value={[resolvedMin, resolvedMax]}
          aria-label={`${label} range`}
          onValueChange={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const [newMin, newMax] = arr;
            const atLeftEdge = newMin === sliderMin;
            const atRightEdge = newMax === availableMax;
            if (atLeftEdge && atRightEdge) {
              onChange(null, null);
            } else {
              const minVal = atLeftEdge ? (hasNone ? NONE : null) : (newMin ?? null);
              const maxVal = atRightEdge ? null : (newMax ?? null);
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
  children,
}: {
  label: string;
  children?: ReactNode;
  options?: string[];
  selected?: string[];
  onToggle?: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
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
            return (
              <Badge
                key={option}
                variant={selected?.includes(option) ? "default" : "outline"}
                className="cursor-pointer"
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
