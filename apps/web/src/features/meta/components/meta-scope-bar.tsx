import { SlidersHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectCombobox } from "@/features/cards/components/multi-select-combobox";
import { META_EVENT_TIER_LABELS } from "@/features/meta/lib/meta-format";
import type {
  MetaEra,
  MetaScope,
  MetaScopeControls,
  MetaScopeFacet,
  ScopeFacetDefaults,
} from "@/features/meta/lib/meta-scope";
import {
  cycleScopeFacet,
  defaultEraId,
  ERA_ALL,
  ERA_CUSTOM,
  isScopeCustomized,
  scopeFacetValues,
} from "@/features/meta/lib/meta-scope";
import { useDeckFormatList } from "@/hooks/use-enums";
import { countryLabel } from "@/lib/country";
import { cn } from "@/lib/utils";

export interface MetaScopeBarProps extends MetaScopeControls {
  eras: readonly MetaEra[];
  countries?: readonly string[];
  extras?: ReactNode;
  extrasActive?: boolean;
  facetDefaults?: ScopeFacetDefaults;
  showTier?: boolean;
  className?: string;
}

export function MetaScopeBar({
  scope,
  setScope,
  clearScope,
  eras,
  countries = [],
  extras,
  extrasActive = false,
  facetDefaults,
  showTier = true,
  className,
}: MetaScopeBarProps) {
  const { formats } = useDeckFormatList();

  const eraItems: Record<string, string> = { [ERA_ALL]: "All time" };
  for (const era of eras) {
    eraItems[era.id] = era.label;
  }
  eraItems[ERA_CUSTOM] = "Custom range";

  const formatOptions = formats.map((format) => ({ value: format.slug, label: format.label }));

  const tierOptions = Object.entries(META_EVENT_TIER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const countryOptions = countries
    .map((code) => ({ value: code, label: countryLabel(code) }))
    .filter((option): option is { value: string; label: string } => option.label !== null);

  return (
    <div data-slot="meta-scope-bar" className={cn("flex flex-wrap items-center gap-2", className)}>
      <ScopeSelect
        label="Era"
        value={scope.era ?? defaultEraId(eras) ?? ERA_ALL}
        fallback={ERA_ALL}
        items={eraItems}
        className="w-44"
        onValueChange={(next) =>
          // Leaving the custom range clears from/to; it does not re-apply hidden dates.
          setScope(
            next === ERA_CUSTOM
              ? { era: ERA_CUSTOM }
              : { era: next, from: undefined, to: undefined },
          )
        }
      />

      {scope.era === ERA_CUSTOM && (
        <>
          <DatePicker
            value={scope.from ?? ""}
            onChange={(iso) => setScope({ from: iso })}
            onClear={() => setScope({ from: undefined })}
            placeholder="From"
            className="w-40"
          />
          <DatePicker
            value={scope.to ?? ""}
            onChange={(iso) => setScope({ to: iso })}
            onClear={() => setScope({ to: undefined })}
            placeholder="To"
            className="w-40"
          />
        </>
      )}

      {showTier && (
        <ScopeFacet
          label="Tier"
          facet="tiers"
          options={tierOptions}
          scope={scope}
          setScope={setScope}
          defaults={facetDefaults}
        />
      )}

      <ScopeFilterMenu
        scope={scope}
        setScope={setScope}
        formats={formats.length > 1 ? formatOptions : []}
        countries={countries.length > 1 ? countryOptions : []}
      />

      {extras}

      {(isScopeCustomized(scope) || extrasActive) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearScope}>
          Reset
        </Button>
      )}
    </div>
  );
}

function ScopeFacet({
  label,
  facet,
  options,
  scope,
  setScope,
  triggerStyle = "button",
  defaults,
}: {
  label: string;
  facet: MetaScopeFacet;
  options: readonly { value: string; label: string }[];
  scope: MetaScope;
  setScope: (patch: Partial<MetaScope>) => void;
  triggerStyle?: "button" | "menu";
  defaults?: ScopeFacetDefaults;
}) {
  const { included, excluded } = scopeFacetValues(scope, facet, defaults);
  return (
    <MultiSelectCombobox
      label={label}
      triggerStyle={triggerStyle}
      triggerSize="default"
      options={options}
      selected={[...included]}
      excluded={[...excluded]}
      onCycle={(value) => setScope(cycleScopeFacet(scope, facet, value, defaults))}
      searchPlaceholder={`Search ${label.toLowerCase()}…`}
    />
  );
}

function facetCount(scope: MetaScope, facet: MetaScopeFacet): number {
  const { included, excluded } = scopeFacetValues(scope, facet);
  return included.length + excluded.length;
}

function ScopeFilterMenu({
  scope,
  setScope,
  formats,
  countries,
}: {
  scope: MetaScope;
  setScope: (patch: Partial<MetaScope>) => void;
  formats: readonly { value: string; label: string }[];
  countries: readonly { value: string; label: string }[];
}) {
  if (formats.length === 0 && countries.length === 0) {
    return null;
  }
  const active =
    (formats.length === 0 ? 0 : facetCount(scope, "formats")) +
    (countries.length === 0 ? 0 : facetCount(scope, "countries"));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />} aria-label="More filters">
        <SlidersHorizontalIcon className="size-4" />
        Filters
        {active > 0 && <span className="text-muted-foreground tabular-nums">({active})</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {formats.length > 0 && (
          <ScopeFacet
            label="Format"
            facet="formats"
            options={formats}
            scope={scope}
            setScope={setScope}
            triggerStyle="menu"
          />
        )}
        {countries.length > 0 && (
          <ScopeFacet
            label="Country"
            facet="countries"
            options={countries}
            scope={scope}
            setScope={setScope}
            triggerStyle="menu"
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScopeSelect({
  label,
  value,
  fallback,
  items,
  className,
  onValueChange,
}: {
  label: string;
  value: string;
  fallback: string;
  items: Record<string, string>;
  className?: string;
  onValueChange: (value: string) => void;
}) {
  const shown = value in items ? value : fallback;
  return (
    // BaseUI passes null on clear; map it to fallback.
    <Select value={shown} onValueChange={(next) => onValueChange(next ?? fallback)} items={items}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([itemValue, itemLabel]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {itemLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
