import type { ReactNode } from "react";

import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import { countryLabel } from "@/lib/country";
import type { MetaDeckFilterCounts, MetaDeckFilterOptions } from "@/lib/meta-deck-filters";
import { META_FINISH_OPTIONS, hasActiveMetaDeckFilters } from "@/lib/meta-deck-filters";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";
import type { MetaEra, MetaScope, MetaScopeFacet } from "@/lib/meta-scope";
import {
  dropScopeFacetValue,
  ERA_ALL,
  META_SCOPE_FACETS,
  scopeFacetValues,
} from "@/lib/meta-scope";

/** The finish select's "no bound" value — an empty string clears the param. */
const ANY_FINISH = "";

const BUILDABLE_SWITCH_ID = "meta-decks-buildable";

/**
 * The deck browser's controls: the archive-wide scope bar, then the axes only a
 * deck list has. Every option is derived from the archive itself, so a control
 * never offers a value nothing was played in.
 */
export function MetaDeckFilterControls({
  options,
  counts,
  eras,
  showCollectionFilter,
}: {
  options: MetaDeckFilterOptions;
  counts: MetaDeckFilterCounts;
  eras: readonly MetaEra[];
  /** Offered only once a collection is loaded — there is nothing to compare against otherwise. */
  showCollectionFilter: boolean;
}) {
  const filters = useMetaDeckFilters();

  const finishItems: Record<string, string> = { [ANY_FINISH]: "Any finish" };
  for (const option of META_FINISH_OPTIONS) {
    finishItems[String(option.value)] = option.label;
  }

  return (
    <div className="flex flex-col gap-2">
      <MetaScopeBar
        scope={filters.scope}
        setScope={filters.setScope}
        clearScope={filters.clearScope}
        eras={eras}
        countries={options.countries}
      />

      <div className="flex flex-wrap items-center gap-2">
        {options.events.length > 1 && (
          <MultiSelectCombobox
            label="Event"
            triggerStyle="chip"
            options={options.events}
            selected={filters.events}
            onChange={(next) => filters.setEvents(next)}
            counts={counts.events}
          />
        )}

        {options.legends.length > 1 && (
          <MultiSelectCombobox
            label="Legend"
            triggerStyle="chip"
            options={options.legends}
            selected={filters.legends}
            onChange={(next) => filters.setLegends(next)}
            counts={counts.legends}
          />
        )}

        <Select
          value={filters.maxRank === null ? ANY_FINISH : String(filters.maxRank)}
          onValueChange={(value) => {
            const next = (value as string | null) ?? ANY_FINISH;
            filters.setMaxRank(next === ANY_FINISH ? null : Number(next));
          }}
          items={finishItems}
        >
          <SelectTrigger className="w-36" aria-label="Finish">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(finishItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showCollectionFilter && (
          <div className="flex items-center gap-2">
            <Switch
              id={BUILDABLE_SWITCH_ID}
              checked={filters.buildable}
              onCheckedChange={(checked) => filters.setBuildable(checked)}
            />
            <Label htmlFor={BUILDABLE_SWITCH_ID}>Mostly buildable</Label>
          </div>
        )}

        {hasActiveMetaDeckFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => filters.clearAllFilters()}>
            Reset filters
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The browser's active-filter chips, mirroring the deck list's strip so a
 * narrowed archive reads the same as a narrowed deck list.
 */
export function MetaDeckActiveFilters({
  options,
  eras,
}: {
  options: MetaDeckFilterOptions;
  eras: readonly MetaEra[];
}) {
  const filters = useMetaDeckFilters();
  const { labels: formatLabels } = useDeckFormatList();

  const eventLabels = new Map(options.events.map((entry) => [entry.value, entry.label]));
  const legendLabels = new Map(options.legends.map((entry) => [entry.value, entry.label]));
  const eraLabels = new Map(eras.map((era) => [era.id, era.label]));
  const finishLabel = META_FINISH_OPTIONS.find((option) => option.value === filters.maxRank)?.label;

  const chip = (key: string, label: string, onRemove: () => void) => (
    <Badge key={key} variant="secondary" className="gap-1">
      <span>{label}</span>
      <ChipRemoveButton aria-label={`Remove ${label}`} onClick={onRemove} />
    </Badge>
  );

  const chips = [
    ...scopeChips(filters.scope, filters.setScope, { formatLabels, eraLabels }, chip),
    ...filters.events.map((slug) =>
      chip(`event-${slug}`, eventLabels.get(slug) ?? slug, () => filters.toggleEvent(slug)),
    ),
    ...filters.legends.map((cardId) =>
      chip(`legend-${cardId}`, legendLabels.get(cardId) ?? cardId, () =>
        filters.toggleLegend(cardId),
      ),
    ),
  ];
  if (finishLabel !== undefined) {
    chips.push(chip("finish", finishLabel, () => filters.setMaxRank(null)));
  }
  if (filters.buildable) {
    chips.push(chip("buildable", "Mostly buildable", () => filters.setBuildable(false)));
  }

  // A scope narrowed by a custom date range alone names nothing, and a strip
  // holding only its own "Clear all" reads as a bug.
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips}
      <Button type="button" variant="ghost" size="sm" onClick={() => filters.clearAllFilters()}>
        Clear all
      </Button>
    </div>
  );
}

/**
 * Chips for the scope facets whose stored value is a code rather than a word: a
 * reader scanning the strip should see "Vendetta", "Standard", "Premier" and
 * "Germany", not `vendetta`, `standard`, `premier` and `DE`. An excluded value
 * wears the same minus sign the card browser's strip uses.
 */
function scopeChips(
  scope: MetaScope,
  setScope: (patch: Partial<MetaScope>) => void,
  labels: { formatLabels: Record<string, string>; eraLabels: ReadonlyMap<string, string> },
  chip: (key: string, label: string, onRemove: () => void) => ReactNode,
): ReactNode[] {
  const chips: ReactNode[] = [];
  const era = scope.era === undefined ? undefined : labels.eraLabels.get(scope.era);
  if (era !== undefined) {
    // All time, not an absent era: absent resolves back to the current set, so
    // removing the chip while it names that set would change nothing.
    chips.push(chip("era", era, () => setScope({ era: ERA_ALL, from: undefined, to: undefined })));
  }

  const facetLabels: Record<MetaScopeFacet, (value: string) => string | null> = {
    formats: (value) => labels.formatLabels[value] ?? null,
    tiers: (value) => META_EVENT_TIER_LABELS[value as MetaEventTierKey] ?? null,
    countries: (value) => countryLabel(value),
  };

  for (const facet of META_SCOPE_FACETS) {
    const { included, excluded } = scopeFacetValues(scope, facet);
    for (const [values, sign] of [
      [included, ""],
      [excluded, "−"],
    ] as const) {
      for (const value of values) {
        const label = facetLabels[facet](value);
        if (label !== null) {
          chips.push(
            chip(`${facet}-${value}`, `${sign}${label}`, () =>
              setScope(dropScopeFacetValue(scope, facet, value)),
            ),
          );
        }
      }
    }
  }
  return chips;
}

type MetaEventTierKey = keyof typeof META_EVENT_TIER_LABELS;
