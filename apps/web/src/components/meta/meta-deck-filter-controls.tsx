import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import type { MetaDeckFilterCounts, MetaDeckFilterOptions } from "@/lib/meta-deck-filters";
import { META_FINISH_OPTIONS, hasActiveMetaDeckFilters } from "@/lib/meta-deck-filters";

/** The finish select's "no bound" value — an empty string clears the param. */
const ANY_FINISH = "";

/**
 * The deck browser's controls. Every axis is derived from the archive itself,
 * so a control never offers a value nothing was played in.
 * @returns The control row.
 */
export function MetaDeckFilterControls({
  options,
  counts,
}: {
  options: MetaDeckFilterOptions;
  counts: MetaDeckFilterCounts;
}) {
  const filters = useMetaDeckFilters();
  const { labels: formatLabels } = useDeckFormatList();

  const finishItems: Record<string, string> = { [ANY_FINISH]: "Any finish" };
  for (const option of META_FINISH_OPTIONS) {
    finishItems[String(option.value)] = option.label;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.formats.length > 1 && (
        <MultiSelectCombobox
          label="Format"
          triggerStyle="chip"
          options={options.formats.map((slug) => ({
            value: slug,
            label: formatLabels[slug] ?? slug,
          }))}
          selected={filters.formats}
          onChange={(next) => filters.setFormats(next)}
          counts={counts.formats}
        />
      )}

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

      <DatePicker
        value={filters.dateFrom ?? ""}
        onChange={(iso) => filters.setDateFrom(iso)}
        onClear={() => filters.setDateFrom(null)}
        placeholder="From"
        className="w-40"
      />
      <DatePicker
        value={filters.dateTo ?? ""}
        onChange={(iso) => filters.setDateTo(iso)}
        onClear={() => filters.setDateTo(null)}
        placeholder="To"
        className="w-40"
      />

      {hasActiveMetaDeckFilters(filters) && (
        <Button type="button" variant="ghost" size="sm" onClick={() => filters.clearAllFilters()}>
          Reset filters
        </Button>
      )}
    </div>
  );
}

/**
 * The browser's active-filter chips, mirroring the deck list's strip so a
 * narrowed archive reads the same as a narrowed deck list.
 * @returns The chip strip, or null when nothing is filtered.
 */
export function MetaDeckActiveFilters({ options }: { options: MetaDeckFilterOptions }) {
  const filters = useMetaDeckFilters();
  const { labels: formatLabels } = useDeckFormatList();

  if (!hasActiveMetaDeckFilters(filters)) {
    return null;
  }

  const eventLabels = new Map(options.events.map((entry) => [entry.value, entry.label]));
  const legendLabels = new Map(options.legends.map((entry) => [entry.value, entry.label]));
  const finishLabel = META_FINISH_OPTIONS.find((option) => option.value === filters.maxRank)?.label;

  /**
   * One chip.
   * @returns The chip.
   */
  const chip = (key: string, label: string, onRemove: () => void) => (
    <Badge key={key} variant="secondary" className="gap-1">
      <span>{label}</span>
      <ChipRemoveButton aria-label={`Remove ${label}`} onClick={onRemove} />
    </Badge>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {filters.formats.map((slug) =>
        chip(`format-${slug}`, formatLabels[slug] ?? slug, () => filters.toggleFormat(slug)),
      )}
      {filters.events.map((slug) =>
        chip(`event-${slug}`, eventLabels.get(slug) ?? slug, () => filters.toggleEvent(slug)),
      )}
      {filters.legends.map((cardId) =>
        chip(`legend-${cardId}`, legendLabels.get(cardId) ?? cardId, () =>
          filters.toggleLegend(cardId),
        ),
      )}
      {finishLabel !== undefined && chip("finish", finishLabel, () => filters.setMaxRank(null))}
      {filters.dateFrom !== null &&
        chip("from", `From ${filters.dateFrom}`, () => filters.setDateFrom(null))}
      {filters.dateTo !== null && chip("to", `To ${filters.dateTo}`, () => filters.setDateTo(null))}

      <Button type="button" variant="ghost" size="sm" onClick={() => filters.clearAllFilters()}>
        Clear all
      </Button>
    </div>
  );
}
