import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import type { MetaDeckCostFilterData } from "@/components/meta/meta-deck-cost-filter";
import { MetaDeckCostFilter } from "@/components/meta/meta-deck-cost-filter";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import type { MetaDeckFilterCounts, MetaDeckFilterOptions } from "@/lib/meta-deck-filters";
import {
  DECK_SCOPE_DEFAULTS,
  hasActiveMetaDeckFilters,
  META_FINISH_OPTIONS,
} from "@/lib/meta-deck-filters";
import type { MetaEra } from "@/lib/meta-scope";

/** The finish select's "no bound" value — an empty string clears the param. */
const ANY_FINISH = "";

/**
 * The deck browser's controls: the archive-wide scope bar with the axes only a
 * deck list has appended in the same control language. Every option is derived
 * from the archive itself, so a control never offers a value nothing was played
 * in.
 */
export function MetaDeckFilterControls({
  options,
  counts,
  eras,
  cost,
}: {
  options: MetaDeckFilterOptions;
  counts: MetaDeckFilterCounts;
  eras: readonly MetaEra[];
  cost: MetaDeckCostFilterData;
}) {
  const filters = useMetaDeckFilters();

  const finishItems: Record<string, string> = { [ANY_FINISH]: "Any finish" };
  for (const option of META_FINISH_OPTIONS) {
    finishItems[String(option.value)] = option.label;
  }

  const extrasActive = hasActiveMetaDeckFilters({
    ...filters,
    valueMin: filters.valueRange.min,
    valueMax: filters.valueRange.max,
  });

  return (
    <MetaScopeBar
      scope={filters.scope}
      setScope={filters.setScope}
      clearScope={filters.clearAllFilters}
      eras={eras}
      countries={options.countries}
      facetDefaults={DECK_SCOPE_DEFAULTS}
      extrasActive={extrasActive}
      extras={
        <>
          {options.legends.length > 1 && (
            <MultiSelectCombobox
              label="Legend"
              triggerStyle="button"
              triggerSize="default"
              options={options.legends}
              selected={filters.legends}
              onChange={(next) => filters.setLegends(next)}
              counts={counts.legends}
              searchPlaceholder="Search legends…"
            />
          )}

          {options.events.length > 1 && (
            <MultiSelectCombobox
              label="Event"
              triggerStyle="button"
              triggerSize="default"
              options={options.events}
              selected={filters.events}
              onChange={(next) => filters.setEvents(next)}
              counts={counts.events}
              searchPlaceholder="Search events…"
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
            <SelectTrigger className="w-34" aria-label="Finish">
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

          <MetaDeckCostFilter
            {...cost}
            trigger="control"
            value={{
              maxCost: filters.maxCost,
              valueRange: filters.valueRange,
              includeSideboard: filters.includeSideboard,
            }}
            onMaxCostChange={(next) => filters.setMaxCost(next)}
            onValueRangeChange={(next) => filters.setValueRange(next)}
            onIncludeSideboardChange={(next) => filters.setIncludeSideboard(next)}
            onClear={() => filters.clearCostFilters()}
          />
        </>
      }
    />
  );
}
