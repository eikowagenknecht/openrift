import type { AvailableFilters, RangeKey } from "@openrift/shared";

import { CardIcon } from "@/components/card-icon";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useCardFilters } from "@/hooks/use-card-filters";
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
  { key: "price", label: "Price", step: 1, formatValue: (v) => `$${v}` },
];

interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  layout?: "inline" | "drawer";
}

export function FilterPanelContent({
  availableFilters,
  setDisplayLabel,
  layout = "inline",
}: FilterPanelContentProps) {
  const {
    filterState,
    ranges,
    toggleArrayFilter,
    toggleSigned,
    togglePromo,
    togglePromoType,
    setRange,
  } = useCardFilters();
  return (
    <>
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => toggleArrayFilter("sets", v)}
        displayLabel={setDisplayLabel}
        layout={layout}
      />
      <FilterSection
        label="Domain"
        options={availableFilters.domains}
        selected={filterState.domains}
        onToggle={(v) => toggleArrayFilter("domains", v)}
        iconPath={(v) => getFilterIconPath("domains", v)}
        displayLabel={formatDomainFilterLabel}
        layout={layout}
      />
      <FilterSection
        label="Type"
        options={availableFilters.types}
        selected={filterState.types}
        onToggle={(v) => toggleArrayFilter("types", v)}
        iconPath={(v) => getFilterIconPath("types", v)}
        layout={layout}
      />
      {availableFilters.superTypes.length > 0 && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={filterState.superTypes}
          onToggle={(v) => toggleArrayFilter("superTypes", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
          layout={layout}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => toggleArrayFilter("rarities", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
        layout={layout}
      />
      {availableFilters.artVariants.length > 1 && (
        <FilterSection
          label="Art Variant"
          options={availableFilters.artVariants}
          selected={filterState.artVariants}
          onToggle={(v) => toggleArrayFilter("artVariants", v)}
          displayLabel={(v) => ART_VARIANT_LABELS[v] ?? v}
          layout={layout}
        />
      )}
      {availableFilters.finishes.length > 1 && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          onToggle={(v) => toggleArrayFilter("finishes", v)}
          displayLabel={(v) => FINISH_LABELS[v] ?? v}
          layout={layout}
        />
      )}
      {(availableFilters.hasSigned || availableFilters.hasPromo) && (
        <div className={layout === "drawer" ? "flex min-w-0 gap-2" : "block space-y-1.5"}>
          <p
            className={`text-xs font-medium text-muted-foreground ${
              layout === "drawer" ? "w-16 shrink-0 pt-1" : ""
            }`}
          >
            Special
          </p>
          <div className="flex flex-1 flex-wrap gap-1">
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
          </div>
          {filterState.promo === "true" && availableFilters.promoTypes.length > 1 && (
            <div className="flex flex-1 flex-wrap gap-1">
              {availableFilters.promoTypes.map((pt) => (
                <Badge
                  key={pt.slug}
                  variant={filterState.promoTypes.includes(pt.slug) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => togglePromoType(pt.slug)}
                >
                  {pt.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <div
        className={layout === "drawer" ? "flex flex-col gap-3" : "flex flex-row flex-wrap gap-4"}
      >
        {RANGE_SECTIONS.map(({ key, label, ...rest }) => {
          const available = availableFilters[key];
          const show = key === "price" ? available.max > 0 : available.min !== available.max;
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
              onChange={(min, max) => setRange(key, min, max)}
              layout={layout}
              {...rest}
            />
          );
        })}
      </div>
    </>
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
  layout = "inline",
}: {
  label: string;
  availableMin: number;
  availableMax: number;
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
  formatValue?: (value: number) => string;
  layout?: "inline" | "drawer";
}) {
  const resolvedMin = selectedMin ?? availableMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;

  return (
    <div className={layout === "drawer" ? "flex min-w-0 items-center gap-2" : "block space-y-1.5"}>
      <p
        className={`text-xs font-medium text-muted-foreground ${layout === "drawer" ? "w-16 shrink-0" : ""}`}
      >
        {label}
      </p>
      <div className={`flex items-center gap-1.5 ${layout === "drawer" ? "flex-1" : "w-36"}`}>
        <span className="shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMin)}
        </span>
        <Slider
          min={availableMin}
          max={availableMax}
          step={step}
          value={[resolvedMin, resolvedMax]}
          aria-label={`${label} range`}
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

function FilterSection({
  label,
  options,
  selected,
  onToggle,
  iconPath,
  displayLabel,
  layout = "inline",
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  layout?: "inline" | "drawer";
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className={layout === "drawer" ? "flex min-w-0 gap-2" : "block space-y-1.5"}>
      <p
        className={`text-xs font-medium text-muted-foreground ${
          layout === "drawer" ? "w-16 shrink-0 pt-1" : ""
        }`}
      >
        {label}
      </p>
      <div className="flex flex-1 flex-wrap gap-1">
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
