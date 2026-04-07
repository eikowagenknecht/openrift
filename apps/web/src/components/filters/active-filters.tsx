import type { AvailableFilters, RangeKey } from "@openrift/shared";
import { NONE } from "@openrift/shared";
import { XIcon } from "lucide-react";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { formatDomainFilterLabel } from "@/lib/domain";
import { ART_VARIANT_LABELS, FINISH_LABELS } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";

const RANGE_BADGE_SECTIONS: {
  key: RangeKey;
  label: string;
  formatValue?: (v: number) => string;
}[] = [
  { key: "energy", label: "Energy" },
  { key: "might", label: "Might" },
  { key: "power", label: "Power" },
  { key: "price", label: "Price", formatValue: (v) => `$${v}` },
];

interface ActiveFiltersProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
}

export function ActiveFilters({
  availableFilters,
  setDisplayLabel,
  hiddenSections,
}: ActiveFiltersProps) {
  const { filterState, ranges } = useFilterValues();
  const {
    toggleArrayFilter,
    setRange,
    clearSigned,
    clearPromo,
    clearBanned,
    clearErrata,
    clearAllFilters,
    setSearch,
  } = useFilterActions();
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
    } => g.values.length > 0 && !hiddenSections?.has(g.key),
  );

  const hasVisibleContent =
    filterState.search !== "" ||
    filterGroups.length > 0 ||
    RANGE_BADGE_SECTIONS.some(({ key }) => ranges[key].min !== null || ranges[key].max !== null) ||
    filterState.signed !== null ||
    filterState.promo !== null ||
    filterState.banned !== null ||
    filterState.errata !== null;

  if (!hasVisibleContent) {
    return null;
  }

  return (
    <div className="bg-muted/50 mb-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1.5 sm:mb-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {filterState.search && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Search:</span>
            <Badge variant="secondary" className="gap-1">
              &ldquo;{filterState.search}&rdquo;
              <button
                type="button"
                onClick={() => setSearch("")}
                className="hover:text-foreground ml-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterGroups.map(({ key, label, values, displayLabel: groupDisplayLabel }) => (
          <div key={key} className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-muted-foreground text-xs">{label}:</span>
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
                    onClick={() => toggleArrayFilter(key, value)}
                    className="hover:text-foreground ml-0.5"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ))}
        {RANGE_BADGE_SECTIONS.map(({ key, label, formatValue }) => {
          const range = ranges[key];
          if (range.min === null && range.max === null) {
            return null;
          }
          return (
            <RangeBadge
              key={key}
              label={label}
              min={range.min}
              max={range.max}
              availableMin={availableFilters[key].min}
              availableMax={availableFilters[key].max}
              onClear={() => setRange(key, null, null)}
              formatValue={formatValue}
            />
          );
        })}
        {filterState.signed !== null && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.signed === "false" ? "Not Signed" : "Signed"}
              <button type="button" onClick={clearSigned} className="hover:text-foreground ml-0.5">
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterState.promo !== null && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.promo === "false" ? "Not Promo" : "Promo"}
              <button type="button" onClick={clearPromo} className="hover:text-foreground ml-0.5">
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterState.banned !== null && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.banned === "false" ? "Not Banned" : "Banned"}
              <button type="button" onClick={clearBanned} className="hover:text-foreground ml-0.5">
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterState.errata !== null && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-xs">Flag:</span>
            <Badge variant="secondary" className="gap-1">
              {filterState.errata === "false" ? "No Errata" : "Errata"}
              <button type="button" onClick={clearErrata} className="hover:text-foreground ml-0.5">
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="destructive"
              size="icon-sm"
              className="shrink-0 self-start"
              onClick={clearAllFilters}
            />
          }
        >
          <XIcon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Clear all filters</TooltipContent>
      </Tooltip>
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
  const fmtNone = (value: number) => (value === NONE ? "None" : fmt(value));
  const valueLabel =
    resolvedMin === NONE && resolvedMax === NONE
      ? "None"
      : resolvedMin === NONE
        ? max === null
          ? `≥None`
          : `None–${fmt(resolvedMax)}`
        : resolvedMin === resolvedMax
          ? fmt(resolvedMin)
          : min !== null && max !== null
            ? `${fmtNone(resolvedMin)}–${fmtNone(resolvedMax)}`
            : min === null
              ? `≤${fmtNone(resolvedMax)}`
              : `≥${fmtNone(resolvedMin)}`;

  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <Badge variant="secondary" className="gap-1">
        {valueLabel}
        <button type="button" onClick={onClear} className="hover:text-foreground ml-0.5">
          <XIcon className="size-3" />
        </button>
      </Badge>
    </div>
  );
}
