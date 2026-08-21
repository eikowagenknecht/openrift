import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS } from "@openrift/shared";
import { ChevronDownIcon } from "lucide-react";
import type { RefObject } from "react";
import { useId } from "react";

import { NEUTRAL_HOVER_SCOPE } from "@/components/filters/multi-select-combobox";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Display name and typed prefix for every searchable field. The prefix rides
 * alongside the label in the menu's gutter, so the scope picker doubles as the
 * only documentation of the `n:` / `k:` search syntax.
 */
export const SEARCH_FIELD_LABELS: Record<SearchField, { label: string; prefix: string }> = {
  name: { label: "Name", prefix: "n:" },
  cardText: { label: "Card Text", prefix: "d:" },
  keywords: { label: "Keywords", prefix: "k:" },
  tags: { label: "Tags", prefix: "t:" },
  artist: { label: "Artist", prefix: "a:" },
  flavorText: { label: "Flavor Text", prefix: "f:" },
  type: { label: "Type", prefix: "ty:" },
  id: { label: "ID", prefix: "id:" },
};

/**
 * Human summary of the current scope for the chip: "all" while every field is
 * in, otherwise up to two field names with a "+N" tail so the chip can't grow
 * past the input's leading addon.
 * @returns The summary text, without the "in: " prefix.
 */
export function scopeSummary(scope: readonly SearchField[]): string {
  if (scope.length === ALL_SEARCH_FIELDS.length) {
    return "all";
  }
  const labels = scope.map((field) => SEARCH_FIELD_LABELS[field].label.toLowerCase());
  return labels.length > 2
    ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
    : labels.join(", ");
}

interface SearchScopeChipProps {
  scope: SearchField[];
  toggleField: (field: SearchField) => void;
  selectAll: () => void;
  selectOnly: (field: SearchField) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The search input. Focus returns here when the menu closes — the chip is
   * only mounted while the input is focused (or the menu open), so restoring
   * focus to the trigger the way a popover normally does would unmount the
   * element holding focus.
   */
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The in-field search-scope chip and its picker. The chip reports which fields
 * a bare query searches ("in: all", "in: name +2") and opens an anchored menu
 * to change it; the trailing × resets to every field. Lives in the search
 * input's leading addon, so the picker never covers the filter chrome the way
 * a full-width panel below the input did.
 *
 * @returns The chip, with its popover menu.
 */
export function SearchScopeChip({
  scope,
  toggleField,
  selectAll,
  selectOnly,
  open,
  onOpenChange,
  inputRef,
}: SearchScopeChipProps) {
  const rowId = useId();
  const allSelected = scope.length === ALL_SEARCH_FIELDS.length;
  const summary = scopeSummary(scope);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Badge variant="secondary" className="min-w-0 font-normal">
        <PopoverTrigger
          className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          // Keep the input's focus on mousedown: the chip is mounted on that
          // focus, so blurring first would unmount the trigger mid-click.
          onMouseDown={(event) => event.preventDefault()}
          aria-label={`Search in: ${summary}. Change search scope`}
        >
          <span className="min-w-0 truncate">in: {summary}</span>
          <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
        </PopoverTrigger>
        {!allSelected && (
          <ChipRemoveButton
            aria-label="Search in all fields"
            onMouseDown={(event) => event.preventDefault()}
            onClick={selectAll}
          />
        )}
      </Badge>
      <PopoverContent
        align="start"
        finalFocus={inputRef}
        className={cn(NEUTRAL_HOVER_SCOPE, "w-64 gap-1 p-1.5")}
      >
        <span className="text-muted-foreground px-1.5 text-xs">Search in</span>
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1.5">
          <Checkbox
            id={`${rowId}-all`}
            checked={allSelected}
            indeterminate={!allSelected}
            // The scope can never be empty (the store refuses it), so this row
            // only ever means "widen back to everything".
            onCheckedChange={selectAll}
          />
          <Label htmlFor={`${rowId}-all`} className="flex-1 cursor-pointer font-normal">
            All fields
          </Label>
        </div>
        <Separator />
        {ALL_SEARCH_FIELDS.map((field) => {
          const { label, prefix } = SEARCH_FIELD_LABELS[field];
          const checked = scope.includes(field);
          const isOnly = checked && scope.length === 1;
          return (
            <div
              key={field}
              className="hover:bg-accent flex items-center gap-2 rounded-md px-1.5 py-1.5"
            >
              <Checkbox
                id={`${rowId}-${field}`}
                checked={checked}
                onCheckedChange={() => toggleField(field)}
              />
              <Label
                htmlFor={`${rowId}-${field}`}
                className="min-w-0 flex-1 cursor-pointer gap-0 font-normal"
              >
                <span className="text-muted-foreground text-2xs w-7 shrink-0 tabular-nums">
                  {prefix}
                </span>
                <span className="min-w-0 truncate">{label}</span>
              </Label>
              {/* Narrowing to one field would otherwise mean unchecking seven.
                  Explicit and labelled, rather than the old panel's invisible
                  mode where a click meant "only this" while all were selected. */}
              {!isOnly && (
                <Pressable
                  className="text-muted-foreground hover:text-foreground text-2xs rounded-sm"
                  aria-label={`Search only ${label}`}
                  onClick={() => selectOnly(field)}
                >
                  only
                </Pressable>
              )}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
