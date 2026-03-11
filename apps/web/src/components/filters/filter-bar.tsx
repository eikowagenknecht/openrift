import type { AvailableFilters, SearchField, SortOption } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Minus,
  Plus,
  Square,
  SquareStack,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCardFilters } from "@/hooks/use-card-filters";
import { useDebounce } from "@/hooks/use-debounce";
import { useDisplayStore } from "@/stores/display-store";

import { DisplaySettingsDropdown, DisplaySettingsInline } from "./display-settings";
import { FilterPanelContent } from "./filter-panel-content";

const SEARCH_FIELD_LABELS: Record<SearchField, { label: string; prefix: string }> = {
  name: { label: "Name", prefix: "n:" },
  cardText: { label: "Card Text", prefix: "d:" },
  keywords: { label: "Keywords", prefix: "k:" },
  tags: { label: "Tags", prefix: "t:" },
  artist: { label: "Artist", prefix: "a:" },
  id: { label: "ID", prefix: "id:" },
};

interface FilterBarProps {
  availableFilters: AvailableFilters;
  totalCards: number;
  filteredCount: number;
  setDisplayLabel?: (code: string) => string;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
  { value: "price", label: "Price" },
];

/* ------------------------------------------------------------------ */
/*  Shared sub-components (desktop / mobile via `compact` prop)       */
/* ------------------------------------------------------------------ */

function SortControls({
  compact,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
}: {
  compact?: boolean;
  sortBy: SortOption;
  sortDir: "asc" | "desc";
  onSortByChange: (v: SortOption) => void;
  onSortDirChange: (v: "asc" | "desc") => void;
}) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortOption)}>
        <SelectTrigger
          size={compact ? "sm" : undefined}
          className={compact ? "flex-1 text-xs" : "w-[160px]"}
          aria-label="Sort by"
        >
          <span className="text-muted-foreground">Sort:&nbsp;</span>
          <SelectValue placeholder="Sort by">
            {(value: string) => sortOptions.find((o) => o.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
        title={sortDir === "asc" ? "Ascending" : "Descending"}
      >
        {sortDir === "asc" ? (
          <ArrowDownNarrowWide className={compact ? undefined : "size-4"} />
        ) : (
          <ArrowUpNarrowWide className={compact ? undefined : "size-4"} />
        )}
      </Button>
    </div>
  );
}

function ViewModeToggle({
  compact,
  view,
  onViewChange,
  className,
}: {
  compact?: boolean;
  view: "cards" | "printings";
  onViewChange: (v: "cards" | "printings") => void;
  className?: string;
}) {
  return (
    <ButtonGroup aria-label="View mode" className={className}>
      <Button
        variant={view === "cards" ? "default" : "outline"}
        size={compact ? "sm" : "icon"}
        className={compact ? "gap-1.5 text-xs" : undefined}
        onClick={() => onViewChange("cards")}
        title={compact ? undefined : "One per card"}
      >
        <Square className={compact ? undefined : "size-4"} />
        {compact && "Cards"}
      </Button>
      <Button
        variant={view === "printings" ? "default" : "outline"}
        size={compact ? "sm" : "icon"}
        className={compact ? "gap-1.5 text-xs" : undefined}
        onClick={() => onViewChange("printings")}
        title={compact ? undefined : "Every printing"}
      >
        <SquareStack className={compact ? undefined : "size-4"} />
        {compact && "Printings"}
      </Button>
    </ButtonGroup>
  );
}

function ColumnControls({
  compact,
  maxColumns,
  autoColumns,
  minColumns,
  maxColumnsLimit,
  onMaxColumnsChange,
}: {
  compact?: boolean;
  maxColumns: number | null;
  autoColumns: number;
  minColumns: number;
  maxColumnsLimit: number;
  onMaxColumnsChange: (v: number | null) => void;
}) {
  return (
    <ButtonGroup aria-label="Columns">
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => {
          if (maxColumns === null) {
            const next = autoColumns - 1;
            if (next >= minColumns) {
              onMaxColumnsChange(next);
            }
          } else if (maxColumns > minColumns) {
            onMaxColumnsChange(maxColumns - 1);
          }
        }}
        disabled={
          (maxColumns !== null && maxColumns <= minColumns) ||
          (maxColumns === null && autoColumns <= minColumns)
        }
        aria-label="Fewer columns"
      >
        <Minus className={compact ? undefined : "size-4"} />
      </Button>
      <ButtonGroupText
        className={
          compact
            ? "flex min-w-7 cursor-pointer items-center justify-center text-xs tabular-nums"
            : "min-w-10 cursor-pointer justify-center tabular-nums"
        }
        onClick={() => {
          if (maxColumns !== null) {
            onMaxColumnsChange(null);
          }
        }}
        title={maxColumns === null ? "Auto columns" : "Reset to auto"}
      >
        {maxColumns === null ? "Auto" : maxColumns}
      </ButtonGroupText>
      <Button
        variant="outline"
        size={compact ? "sm" : "icon"}
        className={compact ? "size-7 p-0" : undefined}
        onClick={() => {
          const next = maxColumns === null ? autoColumns + 1 : maxColumns + 1;
          if (next <= maxColumnsLimit) {
            onMaxColumnsChange(next);
          }
        }}
        disabled={
          maxColumns === null ? autoColumns >= maxColumnsLimit : maxColumns >= maxColumnsLimit
        }
        aria-label="More columns"
      >
        <Plus className={compact ? undefined : "size-4"} />
      </Button>
    </ButtonGroup>
  );
}

/* ------------------------------------------------------------------ */
/*  Main FilterBar                                                     */
/* ------------------------------------------------------------------ */

export function FilterBar({
  availableFilters,
  totalCards,
  filteredCount,
  setDisplayLabel,
}: FilterBarProps) {
  const {
    filterState,
    sortBy,
    sortDir,
    hasActiveFilters,
    searchScope,
    setSearch,
    setSortBy,
    setSortDir,
    view,
    setView,
    toggleSearchField,
  } = useCardFilters();

  const showImages = useDisplayStore((s) => s.showImages);
  const setShowImages = useDisplayStore((s) => s.setShowImages);
  const richEffects = useDisplayStore((s) => s.richEffects);
  const setRichEffects = useDisplayStore((s) => s.setRichEffects);
  const cardFields = useDisplayStore((s) => s.cardFields);
  const setCardFields = useDisplayStore((s) => s.setCardFields);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMaxColumns = useDisplayStore((s) => s.setMaxColumns);
  const maxColumnsLimit = useDisplayStore((s) => s.physicalMax);
  const minColumnsLimit = useDisplayStore((s) => s.physicalMin);
  const autoColumns = useDisplayStore((s) => s.autoColumns);

  const [localSearch, setLocalSearch] = useState(filterState.search);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedSearch = useDebounce(localSearch, 200);

  const prevFilterSearch = useRef(filterState.search);

  const showScopeChips = searchFocused;
  const hasPrefixes = parseSearchTerms(localSearch).some((t) => t.field !== null);

  useEffect(() => {
    // External change (e.g. clear all, clear search badge): sync local state
    if (prevFilterSearch.current !== filterState.search) {
      prevFilterSearch.current = filterState.search;
      setLocalSearch(filterState.search);
      return;
    }

    // Local change via debounce: push to URL
    if (debouncedSearch !== filterState.search) {
      prevFilterSearch.current = debouncedSearch;
      setSearch(debouncedSearch);
    }
  }, [debouncedSearch, filterState.search, setSearch]);

  const filterPanelProps = {
    availableFilters,
    setDisplayLabel,
  };

  const filterSections = <FilterPanelContent {...filterPanelProps} layout="drawer" />;

  const unitLabel = view === "cards" ? "cards" : "printings";
  const cardCountLabel = hasActiveFilters ? `${filteredCount} / ${totalCards}` : String(totalCards);
  const minColumns = minColumnsLimit;

  const columnProps = {
    maxColumns,
    autoColumns,
    minColumns,
    maxColumnsLimit,
    onMaxColumnsChange: setMaxColumns,
  };

  const displayProps = {
    showImages,
    onShowImagesChange: setShowImages,
    richEffects,
    onRichEffectsChange: setRichEffects,
    cardFields,
    onCardFieldsChange: (update: Partial<typeof cardFields>) =>
      setCardFields((prev) => ({ ...prev, ...update })),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search cards..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className={`pl-9 ${localSearch ? "pr-28" : "pr-20"}`}
            />
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              <span className="pointer-events-none text-xs text-muted-foreground">
                {cardCountLabel} {unitLabel}
              </span>
              {localSearch && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setLocalSearch("");
                    setSearch("");
                  }}
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          </div>
          <div
            className={`flex items-start gap-2 overflow-hidden transition-all duration-200 ${
              showScopeChips ? "mt-2 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0"
            }`}
          >
            <span className="shrink-0 text-xs text-muted-foreground">Search in:</span>
            <div
              className={`flex flex-wrap gap-1 ${hasPrefixes ? "pointer-events-none opacity-40" : ""}`}
            >
              {ALL_SEARCH_FIELDS.map((field) => {
                const { label, prefix } = SEARCH_FIELD_LABELS[field];
                const isActive = searchScope.includes(field);
                return (
                  <Badge
                    key={field}
                    variant={isActive ? "default" : "outline"}
                    className="cursor-pointer gap-1 text-xs"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleSearchField(field)}
                  >
                    <span className="text-[10px] opacity-50">{prefix}</span>
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Desktop: inline sort, view, columns controls */}
          <div className="hidden items-center gap-3 sm:flex">
            <SortControls
              sortBy={sortBy}
              sortDir={sortDir}
              onSortByChange={setSortBy}
              onSortDirChange={setSortDir}
            />
            <ViewModeToggle view={view} onViewChange={setView} />
            <ColumnControls {...columnProps} />
            <DisplaySettingsDropdown {...displayProps} />
          </div>

          {/* Mobile: icon-only button that opens options drawer */}
          <Button
            variant="outline"
            size="icon"
            className="relative sm:hidden"
            onClick={() => setSheetOpen(true)}
            aria-label="Options"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      {/* Desktop: inline filter sections (hidden at wide breakpoint where sidebar takes over) */}
      <div className="hidden flex-wrap gap-4 sm:flex wide:hidden">
        <FilterPanelContent {...filterPanelProps} />
      </div>

      {/* Mobile: bottom drawer with sort, display, and filter sections */}
      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="sm:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Options</DrawerTitle>
            <DrawerDescription>Sort, display, and filter options</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div className="space-y-2.5">
              <p className="text-sm font-medium">Options</p>
              <SortControls
                compact
                sortBy={sortBy}
                sortDir={sortDir}
                onSortByChange={setSortBy}
                onSortDirChange={setSortDir}
              />
              <div className="flex items-center gap-2">
                <ViewModeToggle compact view={view} onViewChange={setView} className="mr-auto" />
                <ColumnControls compact {...columnProps} />
              </div>
            </div>

            <div className="space-y-2.5">
              <p className="text-sm font-medium">Display</p>
              <DisplaySettingsInline {...displayProps} />
            </div>

            <div className="border-t pt-4">
              <p className="mb-2.5 text-sm font-medium">Filters</p>
              <div className="flex flex-col gap-4">{filterSections}</div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button className="w-full">
                {hasActiveFilters ? `Show ${filteredCount} ${unitLabel}` : "Done"}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
