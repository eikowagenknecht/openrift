import type { AvailableFilters } from "@openrift/shared";

import { CardIcon } from "@/components/CardIcon";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";

interface FilterSidebarProps {
  availableFilters: AvailableFilters;
  filterState: {
    sets: string[];
    domains: string[];
    types: string[];
    superTypes: string[];
    rarities: string[];
    variants: string[];
  };
  onToggleFilter: (
    key: "sets" | "domains" | "types" | "superTypes" | "rarities" | "variants",
    value: string,
  ) => void;
  energyRange: [number | null, number | null];
  mightRange: [number | null, number | null];
  powerRange: [number | null, number | null];
  priceRange: [number | null, number | null];
  onEnergyRangeChange: (min: number | null, max: number | null) => void;
  onMightRangeChange: (min: number | null, max: number | null) => void;
  onPowerRangeChange: (min: number | null, max: number | null) => void;
  onPriceRangeChange: (min: number | null, max: number | null) => void;
}

export function FilterSidebar({
  availableFilters,
  filterState,
  onToggleFilter,
  energyRange,
  mightRange,
  powerRange,
  priceRange,
  onEnergyRangeChange,
  onMightRangeChange,
  onPowerRangeChange,
  onPriceRangeChange,
}: FilterSidebarProps) {
  return (
    <aside className="hidden wide:block sticky top-[4.5rem] w-[400px] shrink-0 max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-lg px-3">
      <div className="pt-4 pb-4">
        <h2 className="text-lg font-semibold">Filters</h2>
      </div>

      <div className="space-y-4 pb-4">
        <FilterSection
          label="Set"
          options={availableFilters.sets}
          selected={filterState.sets}
          onToggle={(v) => onToggleFilter("sets", v)}
        />
        <FilterSection
          label="Domain"
          options={availableFilters.domains}
          selected={filterState.domains}
          onToggle={(v) => onToggleFilter("domains", v)}
          iconPath={(v) => getFilterIconPath("domains", v)}
          displayLabel={formatDomainFilterLabel}
        />
        <FilterSection
          label="Type"
          options={availableFilters.types}
          selected={filterState.types}
          onToggle={(v) => onToggleFilter("types", v)}
          iconPath={(v) => getFilterIconPath("types", v)}
        />
        {availableFilters.superTypes.length > 0 && (
          <FilterSection
            label="Super Type"
            options={availableFilters.superTypes}
            selected={filterState.superTypes}
            onToggle={(v) => onToggleFilter("superTypes", v)}
            iconPath={(v) => getFilterIconPath("superTypes", v)}
          />
        )}
        <FilterSection
          label="Rarity"
          options={availableFilters.rarities}
          selected={filterState.rarities}
          onToggle={(v) => onToggleFilter("rarities", v)}
          iconPath={(v) => getFilterIconPath("rarities", v)}
        />
        {availableFilters.variants.length > 0 && (
          <FilterSection
            label="Version"
            options={availableFilters.variants}
            selected={filterState.variants}
            onToggle={(v) => onToggleFilter("variants", v)}
          />
        )}
        <div className="flex flex-wrap gap-4">
          {availableFilters.energyMin !== availableFilters.energyMax && (
            <RangeFilterSection
              label="Energy"
              availableMin={availableFilters.energyMin}
              availableMax={availableFilters.energyMax}
              selectedMin={energyRange[0]}
              selectedMax={energyRange[1]}
              onChange={onEnergyRangeChange}
            />
          )}
          {availableFilters.mightMin !== availableFilters.mightMax && (
            <RangeFilterSection
              label="Might"
              availableMin={availableFilters.mightMin}
              availableMax={availableFilters.mightMax}
              selectedMin={mightRange[0]}
              selectedMax={mightRange[1]}
              onChange={onMightRangeChange}
            />
          )}
          {availableFilters.powerMin !== availableFilters.powerMax && (
            <RangeFilterSection
              label="Power"
              availableMin={availableFilters.powerMin}
              availableMax={availableFilters.powerMax}
              selectedMin={powerRange[0]}
              selectedMax={powerRange[1]}
              onChange={onPowerRangeChange}
            />
          )}
          {availableFilters.priceMax > 0 && (
            <RangeFilterSection
              label="Price"
              availableMin={availableFilters.priceMin}
              availableMax={availableFilters.priceMax}
              selectedMin={priceRange[0]}
              selectedMax={priceRange[1]}
              onChange={onPriceRangeChange}
              step={1}
              formatValue={(v) => `$${v}`}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
  iconPath,
  displayLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const icon = iconPath?.(option);
          return (
            <Badge
              key={option}
              variant={selected.includes(option) ? "default" : "outline"}
              className="cursor-pointer gap-1"
              onClick={() => onToggle(option)}
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

function RangeFilterSection({
  label,
  availableMin,
  availableMax,
  selectedMin,
  selectedMax,
  onChange,
  step = 1,
  formatValue,
}: {
  label: string;
  availableMin: number;
  availableMax: number;
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
  formatValue?: (value: number) => string;
}) {
  const resolvedMin = selectedMin ?? availableMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex w-36 items-center gap-1.5">
        <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMin)}
        </span>
        <Slider
          min={availableMin}
          max={availableMax}
          step={step}
          value={[resolvedMin, resolvedMax]}
          onValueChange={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const [newMin, newMax] = arr;
            onChange(
              newMin === availableMin ? null : (newMin ?? null),
              newMax === availableMax ? null : (newMax ?? null),
            );
          }}
          className="flex-1"
        />
        <span className="w-6 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMax)}
        </span>
      </div>
    </div>
  );
}
