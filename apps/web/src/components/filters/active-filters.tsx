import type { AvailableFilters } from "@openrift/shared";
import { X } from "lucide-react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDomainFilterLabel } from "@/lib/domain";
import { ART_VARIANT_LABELS, FINISH_LABELS } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";

interface ActiveFiltersProps {
  filterState: {
    search: string;
    sets: string[];
    rarities: string[];
    types: string[];
    superTypes: string[];
    domains: string[];
    artVariants: string[];
    finishes: string[];
    signed: string | null;
    promo: string | null;
  };
  availableFilters: AvailableFilters;
  energyRange: [number | null, number | null];
  mightRange: [number | null, number | null];
  powerRange: [number | null, number | null];
  priceRange: [number | null, number | null];
  hasActiveFilters: boolean;
  onToggleFilter: (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "artVariants" | "finishes",
    value: string,
  ) => void;
  onClearEnergyRange: () => void;
  onClearMightRange: () => void;
  onClearPowerRange: () => void;
  onClearPriceRange: () => void;
  onClearSigned: () => void;
  onClearPromo: () => void;
  onClearAll: () => void;
  onClearSearch: () => void;
  setDisplayLabel?: (code: string) => string;
}

export function ActiveFilters({
  filterState,
  availableFilters,
  energyRange,
  mightRange,
  powerRange,
  priceRange,
  hasActiveFilters,
  onToggleFilter,
  onClearEnergyRange,
  onClearMightRange,
  onClearPowerRange,
  onClearPriceRange,
  onClearSigned,
  onClearPromo,
  onClearAll,
  onClearSearch,
  setDisplayLabel,
}: ActiveFiltersProps) {
  if (!hasActiveFilters) {
    return null;
  }

  type FilterKey =
    | "sets"
    | "rarities"
    | "types"
    | "superTypes"
    | "domains"
    | "artVariants"
    | "finishes";

  const filterGroups: {
    key: FilterKey;
    label: string;
    values: string[];
    displayLabel?: (v: string) => string;
  }[] = [
    { key: "sets", label: "Set", values: filterState.sets },
    { key: "rarities", label: "Rarity", values: filterState.rarities },
    { key: "types", label: "Type", values: filterState.types },
    { key: "superTypes", label: "Super Type", values: filterState.superTypes },
    { key: "domains", label: "Domain", values: filterState.domains },
    {
      key: "artVariants",
      label: "Art Variant",
      values: filterState.artVariants,
      displayLabel: (v: string) => ART_VARIANT_LABELS[v] ?? v,
    },
    {
      key: "finishes",
      label: "Finish",
      values: filterState.finishes,
      displayLabel: (v: string) => FINISH_LABELS[v] ?? v,
    },
  ].filter(
    (
      g,
    ): g is {
      key: FilterKey;
      label: string;
      values: string[];
      displayLabel?: (v: string) => string;
    } => g.values.length > 0,
  );

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {filterState.search && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Search:</span>
            <Badge variant="secondary" className="gap-1">
              &ldquo;{filterState.search}&rdquo;
              <button
                type="button"
                onClick={onClearSearch}
                className="ml-0.5 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterGroups.map(({ key, label, values, displayLabel: groupDisplayLabel }) => (
          <div key={key} className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">{label}:</span>
            {values.map((value) => {
              const icon = getFilterIconPath(key, value);
              const displayFn =
                groupDisplayLabel ??
                (key === "sets" && setDisplayLabel ? setDisplayLabel : formatDomainFilterLabel);
              return (
                <Badge key={`${key}-${value}`} variant="secondary" className="gap-1">
                  {icon && <CardIcon src={icon} />}
                  {displayFn(value)}
                  <button
                    type="button"
                    onClick={() => onToggleFilter(key, value)}
                    className="ml-0.5 hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ))}
        {(energyRange[0] !== null || energyRange[1] !== null) && (
          <RangeBadge
            label="Energy"
            min={energyRange[0]}
            max={energyRange[1]}
            availableMin={availableFilters.energy.min}
            availableMax={availableFilters.energy.max}
            onClear={onClearEnergyRange}
          />
        )}
        {(mightRange[0] !== null || mightRange[1] !== null) && (
          <RangeBadge
            label="Might"
            min={mightRange[0]}
            max={mightRange[1]}
            availableMin={availableFilters.might.min}
            availableMax={availableFilters.might.max}
            onClear={onClearMightRange}
          />
        )}
        {(powerRange[0] !== null || powerRange[1] !== null) && (
          <RangeBadge
            label="Power"
            min={powerRange[0]}
            max={powerRange[1]}
            availableMin={availableFilters.power.min}
            availableMax={availableFilters.power.max}
            onClear={onClearPowerRange}
          />
        )}
        {(priceRange[0] !== null || priceRange[1] !== null) && (
          <RangeBadge
            label="Price"
            min={priceRange[0]}
            max={priceRange[1]}
            availableMin={availableFilters.price.min}
            availableMax={availableFilters.price.max}
            onClear={onClearPriceRange}
            formatValue={(v) => `$${v}`}
          />
        )}
        {filterState.signed !== null && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.signed === "false" ? "Not Signed" : "Signed"}
              <button
                type="button"
                onClick={onClearSigned}
                className="ml-0.5 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterState.promo !== null && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.promo === "false" ? "Not Promo" : "Promo"}
              <button type="button" onClick={onClearPromo} className="ml-0.5 hover:text-foreground">
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 self-start"
        onClick={onClearAll}
        title="Clear all filters"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function RangeBadge({
  label,
  min,
  max,
  availableMin,
  availableMax,
  onClear,
  formatValue,
}: {
  label: string;
  min: number | null;
  max: number | null;
  availableMin: number;
  availableMax: number;
  onClear: () => void;
  formatValue?: (value: number) => string;
}) {
  const resolvedMin = min ?? availableMin;
  const resolvedMax = max ?? availableMax;
  const fmt = formatValue ?? String;
  const valueLabel =
    resolvedMin === resolvedMax
      ? fmt(resolvedMin)
      : min !== null && max !== null
        ? `${fmt(resolvedMin)}–${fmt(resolvedMax)}`
        : min === null
          ? `≤${fmt(resolvedMax)}`
          : `≥${fmt(resolvedMin)}`;

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <Badge variant="secondary" className="gap-1">
        {valueLabel}
        <button type="button" onClick={onClear} className="ml-0.5 hover:text-foreground">
          <X className="size-3" />
        </button>
      </Badge>
    </div>
  );
}
