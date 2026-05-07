import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  /** Stored selection value (typically a slug). */
  value: string;
  /** Visible label rendered in the row. May contain spaces / separators so it wraps cleanly. */
  label: string;
  /**
   * Optional override for the cmdk filter value. Defaults to `label`.
   * Use this when the visible label and the searchable text differ.
   */
  searchValue?: string;
}

interface MultiSelectComboboxProps {
  /** Label shown on the trigger badge (e.g. "Channels", "Markers"). */
  label: string;
  options: readonly MultiSelectOption[];
  /** Currently selected values. */
  selected: string[];
  onToggle: (value: string) => void;
  /** Placeholder for the search input. Defaults to "Search…". */
  searchPlaceholder?: string;
  /** Empty-state text shown when the search matches nothing. Defaults to "No matches.". */
  emptyText?: string;
}

/**
 * Generic multi-select combobox styled as a Badge trigger plus a popover with
 * a cmdk Command panel. Used by both the Channel filter (breadcrumb labels)
 * and the Marker filter on /promos.
 *
 * @returns The combobox trigger and popover.
 */
export function MultiSelectCombobox({
  label,
  options,
  selected,
  onToggle,
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const hasSelection = selected.length > 0;
  const triggerLabel = hasSelection ? `${label} (${selected.length})` : label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Badge
            variant={hasSelection ? "default" : "outline"}
            className="cursor-pointer"
            render={<button type="button" />}
          >
            {triggerLabel}
            <ChevronDownIcon className="opacity-60" />
          </Badge>
        }
      />
      <PopoverContent align="start" className="w-max max-w-[90vw] min-w-72 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((option) => {
              const isSelected = selectedSet.has(option.value);
              return (
                <CommandItem
                  key={option.value}
                  // cmdk filters by `value`; default to the visible label so
                  // typing matches what the user sees.
                  value={option.searchValue ?? option.label}
                  data-checked={isSelected}
                  onSelect={() => onToggle(option.value)}
                  className={cn("cursor-pointer", isSelected && "font-medium")}
                >
                  {/* Wrap long labels (e.g. breadcrumb paths) instead of truncating
                      when the popover is capped by max-w-[90vw] on narrow screens. */}
                  <span className="min-w-0 flex-1 break-words whitespace-normal">
                    {option.label}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
