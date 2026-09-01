import type { ReactNode } from "react";

import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeckFormatList } from "@/hooks/use-enums";
import { countryLabel } from "@/lib/country";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";
import type { MetaEra, MetaScope, MetaScopeControls, MetaScopeFacet } from "@/lib/meta-scope";
import {
  cycleScopeFacet,
  ERA_ALL,
  ERA_CUSTOM,
  isScopeNarrowed,
  scopeFacetValues,
} from "@/lib/meta-scope";
import { cn } from "@/lib/utils";

export interface MetaScopeBarProps extends MetaScopeControls {
  eras: readonly MetaEra[];
  /**
   * The country codes worth offering, which is the set the page's own payload
   * covers. A control that offers a country nothing was played in is a dead end,
   * and there is no endpoint that would know better than the caller.
   */
  countries?: readonly string[];
  /**
   * A surface's own controls, rendered inside the bar so they wrap with it
   * rather than forming a second row of filters below it.
   */
  extras?: ReactNode;
  /** Whether {@link extras} are narrowing anything, so Reset offers itself. */
  extrasActive?: boolean;
  className?: string;
}

/**
 * The one scope bar every archive page carries: which era, format, tier and
 * country the page is about. Controlled, so the route owns the URL and the bar
 * can be driven straight from a test.
 *
 * The era is a single window, so it stays a select. The three value facets cycle
 * off → include → exclude → off like the card browser's, so a reader who wants
 * every country but one picks the one.
 */
export function MetaScopeBar({
  scope,
  setScope,
  clearScope,
  eras,
  countries = [],
  extras,
  extrasActive = false,
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
        value={scope.era ?? ERA_ALL}
        fallback={ERA_ALL}
        items={eraItems}
        className="w-44"
        onValueChange={(next) =>
          // Leaving the custom range drops its bounds with it, so a later return
          // to it opens empty instead of re-applying dates the reader cannot see.
          setScope(
            next === ERA_CUSTOM
              ? { era: ERA_CUSTOM }
              : { era: next === ERA_ALL ? undefined : next, from: undefined, to: undefined },
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

      {formats.length > 1 && (
        <ScopeFacet
          label="Format"
          facet="formats"
          options={formatOptions}
          scope={scope}
          setScope={setScope}
        />
      )}

      <ScopeFacet
        label="Tier"
        facet="tiers"
        options={tierOptions}
        scope={scope}
        setScope={setScope}
      />

      {countries.length > 1 && (
        <ScopeFacet
          label="Country"
          facet="countries"
          options={countryOptions}
          scope={scope}
          setScope={setScope}
        />
      )}

      {extras}

      {(isScopeNarrowed(scope) || extrasActive) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearScope}>
          Reset
        </Button>
      )}
    </div>
  );
}

/**
 * One value facet as a cycling include/exclude dropdown. The trigger names the
 * facet while nothing is picked, then the picks themselves.
 */
function ScopeFacet({
  label,
  facet,
  options,
  scope,
  setScope,
}: {
  label: string;
  facet: MetaScopeFacet;
  options: readonly { value: string; label: string }[];
  scope: MetaScope;
  setScope: (patch: Partial<MetaScope>) => void;
}) {
  const { included, excluded } = scopeFacetValues(scope, facet);
  return (
    <MultiSelectCombobox
      label={label}
      triggerStyle="button"
      options={options}
      selected={[...included]}
      excluded={[...excluded]}
      onCycle={(value) => setScope(cycleScopeFacet(scope, facet, value))}
      searchPlaceholder={`Search ${label.toLowerCase()}…`}
    />
  );
}

/**
 * One select, showing its fallback rather than the raw key when the URL carries
 * a value the options no longer hold. A bookmarked `?era=retired-set` scopes as
 * all time, and BaseUI would otherwise label the trigger with the dead slug
 * while the page showed everything.
 */
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
    // BaseUI hands back null when a select is cleared, which for these means the
    // unnarrowed option rather than an absent value.
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
