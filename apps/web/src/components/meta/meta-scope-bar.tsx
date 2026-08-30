import type { MetaEventTier } from "@openrift/shared";

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
import type { MetaEra, MetaScopeControls } from "@/lib/meta-scope";
import { ERA_ALL, ERA_CUSTOM, isScopeNarrowed } from "@/lib/meta-scope";
import { cn } from "@/lib/utils";

/** Every select's "no narrowing" option. An empty string is what clears the param. */
const ANY = "";

export interface MetaScopeBarProps extends MetaScopeControls {
  eras: readonly MetaEra[];
  /**
   * The country codes worth offering, which is the set the page's own payload
   * covers. A control that offers a country nothing was played in is a dead end,
   * and there is no endpoint that would know better than the caller.
   */
  countries?: readonly string[];
  className?: string;
}

/**
 * The one scope bar every archive page carries: which era, format, tier and
 * country the page is about. Controlled, so the route owns the URL and the bar
 * can be driven straight from a test.
 */
export function MetaScopeBar({
  scope,
  setScope,
  clearScope,
  eras,
  countries = [],
  className,
}: MetaScopeBarProps) {
  const { formats } = useDeckFormatList();

  const eraItems: Record<string, string> = { [ERA_ALL]: "All time" };
  for (const era of eras) {
    eraItems[era.id] = era.label;
  }
  eraItems[ERA_CUSTOM] = "Custom range";

  const formatItems: Record<string, string> = { [ANY]: "All formats" };
  for (const format of formats) {
    formatItems[format.slug] = format.label;
  }

  const tierItems: Record<string, string> = { [ANY]: "All tiers", ...META_EVENT_TIER_LABELS };

  const countryItems: Record<string, string> = { [ANY]: "All countries" };
  for (const code of countries) {
    const label = countryLabel(code);
    if (label !== null) {
      countryItems[code] = label;
    }
  }

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
        <ScopeSelect
          label="Format"
          value={scope.format ?? ANY}
          fallback={ANY}
          items={formatItems}
          className="w-40"
          onValueChange={(next) => setScope({ format: next === ANY ? undefined : next })}
        />
      )}

      <ScopeSelect
        label="Tier"
        value={scope.tier ?? ANY}
        fallback={ANY}
        items={tierItems}
        className="w-36"
        onValueChange={(next) =>
          setScope({ tier: next === ANY ? undefined : (next as MetaEventTier) })
        }
      />

      {countries.length > 1 && (
        <ScopeSelect
          label="Country"
          value={scope.country ?? ANY}
          fallback={ANY}
          items={countryItems}
          className="w-44"
          onValueChange={(next) => setScope({ country: next === ANY ? undefined : next })}
        />
      )}

      {isScopeNarrowed(scope) && (
        <Button type="button" variant="ghost" size="sm" onClick={clearScope}>
          Reset
        </Button>
      )}
    </div>
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
