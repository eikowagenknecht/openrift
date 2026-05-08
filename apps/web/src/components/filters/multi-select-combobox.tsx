import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";

interface MultiSelectOption {
  /** Stored selection value (typically a slug). */
  value: string;
  /** Visible label rendered in the row. Long labels wrap onto multiple lines. */
  label: string;
}

interface MultiSelectComboboxProps {
  /** Trigger badge label (e.g. "Channels", "Markers"). */
  label: string;
  options: readonly MultiSelectOption[];
  /** Currently selected values. */
  selected: string[];
  /** Called with the new selection on every change. */
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
}

/**
 * Multi-select combobox with a Badge-styled trigger that opens a searchable
 * popover. Built on the shadcn BaseUI Combobox recipe — selection, filtering,
 * and keyboard navigation are handled by the primitive; this wrapper just
 * adapts the trigger styling to match the other filter chips and threads
 * label lookups through the items list.
 *
 * @returns The combobox trigger and popover.
 */
export function MultiSelectCombobox({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
}: MultiSelectComboboxProps) {
  const items = options.map((option) => option.value);
  const labelMap = new Map(options.map((option) => [option.value, option.label] as const));
  const hasSelection = selected.length > 0;
  const triggerLabel = hasSelection ? `${label} (${selected.length})` : label;
  const labelFor = (value: string) => labelMap.get(value) ?? value;

  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={selected}
      onValueChange={(next) => onChange(next)}
      itemToStringLabel={labelFor}
    >
      {/* ComboboxTrigger appends its own chevron, so the Badge children only
          carry the label. */}
      <ComboboxTrigger
        render={
          <Badge
            variant={hasSelection ? "default" : "outline"}
            className="cursor-pointer"
            render={<button type="button" />}
          />
        }
      >
        {triggerLabel}
      </ComboboxTrigger>
      {/* Override the default w-(--anchor-width) so the popup grows to fit
          its widest item (e.g. long breadcrumbs), capped at 90vw on narrow
          screens with an 18rem floor so the search input stays usable. */}
      <ComboboxContent className="w-max max-w-[90vw] min-w-72">
        <ComboboxInput placeholder={searchPlaceholder} showTrigger={false} />
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(value: string) => (
            <ComboboxItem key={value} value={value}>
              {/* Wrap long labels (e.g. breadcrumb paths) instead of truncating
                  when the popover is capped on narrow screens. */}
              <span className="min-w-0 flex-1 break-words whitespace-normal">
                {labelFor(value)}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
