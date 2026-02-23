import type { AvailableFilters, SearchField, SortDirection, SortOption } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Columns3,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/CardIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";

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
  filterState: {
    search: string;
    sets: string[];
    rarities: string[];
    types: string[];
    superTypes: string[];
    domains: string[];
    variants: string[];
  };
  energyRange: [number | null, number | null];
  mightRange: [number | null, number | null];
  powerRange: [number | null, number | null];
  priceRange: [number | null, number | null];
  sortBy: SortOption;
  sortDir: SortDirection;
  totalCards: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  searchScope: SearchField[];
  onSearchChange: (search: string) => void;
  onToggleFilter: (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants",
    value: string,
  ) => void;
  onEnergyRangeChange: (min: number | null, max: number | null) => void;
  onMightRangeChange: (min: number | null, max: number | null) => void;
  onPowerRangeChange: (min: number | null, max: number | null) => void;
  onPriceRangeChange: (min: number | null, max: number | null) => void;
  onSortChange: (sort: SortOption) => void;
  onSortDirChange: (dir: SortDirection) => void;
  onSearchScopeToggle: (field: SearchField) => void;
  maxColumns: number | null;
  maxColumnsLimit?: number;
  onMaxColumnsChange?: (value: number | null) => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
  { value: "price", label: "Price" },
];

export function FilterBar({
  availableFilters,
  filterState,
  energyRange,
  mightRange,
  powerRange,
  priceRange,
  sortBy,
  sortDir,
  totalCards,
  filteredCount,
  hasActiveFilters,
  searchScope,
  onSearchChange,
  onToggleFilter,
  onEnergyRangeChange,
  onMightRangeChange,
  onPowerRangeChange,
  onPriceRangeChange,
  onSortChange,
  onSortDirChange,
  onSearchScopeToggle,
  maxColumns,
  maxColumnsLimit = 8,
  onMaxColumnsChange,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filterState.search);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedSearch = useDebounce(localSearch, 200);

  // Close mobile filter sheet when viewport grows past the sm breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const handler = () => {
      if (mq.matches) {
        setSheetOpen(false);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
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
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, filterState.search, onSearchChange]);

  const filterSections = (
    <>
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => onToggleFilter("sets", v)}
      />
      <FilterSection
        label="Domain"
        options={availableFilters.domains}
        selected={filterState.domains}
        onToggle={(v) => onToggleFilter("domains", v)}
        iconPath={(v) => getFilterIconPath("domains", v)}
        displayLabel={formatDomainFilterLabel}
      />
      <FilterSection
        label="Type"
        options={availableFilters.types}
        selected={filterState.types}
        onToggle={(v) => onToggleFilter("types", v)}
        iconPath={(v) => getFilterIconPath("types", v)}
      />
      {availableFilters.superTypes.length > 0 && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={filterState.superTypes}
          onToggle={(v) => onToggleFilter("superTypes", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => onToggleFilter("rarities", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
      />
      {availableFilters.variants.length > 0 && (
        <FilterSection
          label="Version"
          options={availableFilters.variants}
          selected={filterState.variants}
          onToggle={(v) => onToggleFilter("variants", v)}
        />
      )}
      {availableFilters.energyMin !== availableFilters.energyMax && (
        <RangeFilterSection
          label="Energy"
          availableMin={availableFilters.energyMin}
          availableMax={availableFilters.energyMax}
          selectedMin={energyRange[0]}
          selectedMax={energyRange[1]}
          onChange={onEnergyRangeChange}
        />
      )}
      {availableFilters.mightMin !== availableFilters.mightMax && (
        <RangeFilterSection
          label="Might"
          availableMin={availableFilters.mightMin}
          availableMax={availableFilters.mightMax}
          selectedMin={mightRange[0]}
          selectedMax={mightRange[1]}
          onChange={onMightRangeChange}
        />
      )}
      {availableFilters.powerMin !== availableFilters.powerMax && (
        <RangeFilterSection
          label="Power"
          availableMin={availableFilters.powerMin}
          availableMax={availableFilters.powerMax}
          selectedMin={powerRange[0]}
          selectedMax={powerRange[1]}
          onChange={onPowerRangeChange}
        />
      )}
      {availableFilters.priceMax > 0 && (
        <RangeFilterSection
          label="Price"
          availableMin={availableFilters.priceMin}
          availableMax={availableFilters.priceMax}
          selectedMin={priceRange[0]}
          selectedMax={priceRange[1]}
          onChange={onPriceRangeChange}
          step={1}
          formatValue={(v) => `$${v}`}
        />
      )}
    </>
  );

  const cardCountLabel = hasActiveFilters ? `${filteredCount} / ${totalCards}` : String(totalCards);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
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
                {cardCountLabel} cards
              </span>
              {localSearch && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setLocalSearch("");
                    onSearchChange("");
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
                    onClick={() => onSearchScopeToggle(field)}
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
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-[160px]">
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
            size="icon"
            onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {sortDir === "asc" ? (
              <ArrowDownNarrowWide className="size-4" />
            ) : (
              <ArrowUpNarrowWide className="size-4" />
            )}
          </Button>

          {/* Desktop: columns dropdown */}
          {onMaxColumnsChange && (
            <Select
              value={maxColumns === null ? "auto" : String(maxColumns)}
              onValueChange={(v) => onMaxColumnsChange(v === "auto" ? null : Number(v))}
            >
              <SelectTrigger className="hidden w-[140px] sm:flex">
                <span className="text-muted-foreground">Cols:&nbsp;</span>
                <SelectValue>{(value: string) => (value === "auto" ? "Auto" : value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {[2, 3, 4, 5, 6, 7, 8]
                  .filter((n) => n <= maxColumnsLimit || n === maxColumns)
                  .map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {/* Mobile: columns dropdown */}
          {onMaxColumnsChange && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="sm:hidden"
                    aria-label={maxColumns === null ? "Columns: Auto" : `Columns: ${maxColumns}`}
                  />
                }
              >
                <Columns3 className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={maxColumns === null ? "auto" : String(maxColumns)}
                  onValueChange={(v) => onMaxColumnsChange(v === "auto" ? null : Number(v))}
                >
                  <DropdownMenuRadioItem value="auto">Auto</DropdownMenuRadioItem>
                  {[2, 3, 4, 5, 6]
                    .filter((n) => n <= maxColumnsLimit || n === maxColumns)
                    .map((n) => (
                      <DropdownMenuRadioItem key={n} value={String(n)}>
                        {n} columns
                      </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Mobile: Filters button that opens bottom sheet */}
          <Button
            variant="outline"
            size="sm"
            className="relative sm:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <SlidersHorizontal className="mr-2 size-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Desktop: inline filter sections */}
      <div className="hidden flex-wrap gap-4 sm:flex">{filterSections}</div>

      {/* Mobile: bottom sheet with filter sections */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] sm:hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription className="sr-only">Filter options</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4">{filterSections}</div>
          <SheetFooter>
            <SheetClose render={<Button className="w-full" />}>
              {hasActiveFilters
                ? `Show ${filteredCount} card${filteredCount !== 1 ? "s" : ""}`
                : "Done"}
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RangeFilterSection({
  label,
  availableMin,
  availableMax,
  selectedMin,
  selectedMax,
  onChange,
  step = 1,
  formatValue,
}: {
  label: string;
  availableMin: number;
  availableMax: number;
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
  formatValue?: (value: number) => string;
}) {
  const resolvedMin = selectedMin ?? availableMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex w-36 items-center gap-1.5">
        <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMin)}
        </span>
        <Slider
          min={availableMin}
          max={availableMax}
          step={step}
          value={[resolvedMin, resolvedMax]}
          onValueChange={(values) => {
            const arr = Array.isArray(values) ? values : [values];
            const [newMin, newMax] = arr;
            onChange(
              newMin === availableMin ? null : (newMin ?? null),
              newMax === availableMax ? null : (newMax ?? null),
            );
          }}
          className="flex-1"
        />
        <span className="w-6 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMax)}
        </span>
      </div>
    </div>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
  iconPath,
  displayLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const icon = iconPath?.(option);
          return (
            <Badge
              key={option}
              variant={selected.includes(option) ? "default" : "outline"}
              className="cursor-pointer gap-1"
              onClick={() => onToggle(option)}
            >
              {icon && <CardIcon src={icon} />}
              {displayLabel ? displayLabel(option) : option}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
