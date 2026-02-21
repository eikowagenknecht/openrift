import type { AvailableFilters, SearchField, SortOption } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import { Menu, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CardFields } from "@/components/cards/CardThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { useDebounce } from "@/hooks/use-debounce";

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
  sortBy: SortOption;
  showImages: boolean;
  totalCards: number;
  filteredCount: number;
  hasActiveFilters: boolean;
  searchScope: SearchField[];
  onSearchChange: (search: string) => void;
  onToggleFilter: (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants",
    value: string,
  ) => void;
  onSortChange: (sort: SortOption) => void;
  onShowImagesChange: (show: boolean) => void;
  onSearchScopeToggle: (field: SearchField) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "energy", label: "Energy" },
  { value: "rarity", label: "Rarity" },
];

export function FilterBar({
  availableFilters,
  filterState,
  sortBy,
  showImages,
  totalCards,
  filteredCount,
  hasActiveFilters,
  searchScope,
  onSearchChange,
  onToggleFilter,
  onSortChange,
  onShowImagesChange,
  onSearchScopeToggle,
  cardFields,
  onCardFieldsChange,
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

  const showScopeChips = searchFocused || localSearch.length > 0;
  const hasPrefixes = useMemo(
    () => parseSearchTerms(localSearch).some((t) => t.field !== null),
    [localSearch],
  );

  const activeFilterCount =
    filterState.sets.length +
    filterState.rarities.length +
    filterState.types.length +
    filterState.superTypes.length +
    filterState.domains.length +
    filterState.variants.length;

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
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => onToggleFilter("rarities", v)}
        iconPath={(v) => `/icons/rarities/${v.toLowerCase()}.webp`}
      />
      <FilterSection
        label="Type"
        options={availableFilters.types}
        selected={filterState.types}
        onToggle={(v) => onToggleFilter("types", v)}
        iconPath={(v) => `/icons/types/${v.toLowerCase()}.svg`}
      />
      {availableFilters.superTypes.length > 0 && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={filterState.superTypes}
          onToggle={(v) => onToggleFilter("superTypes", v)}
          iconPath={(v) => {
            const path = `/icons/supertypes/${v.toLowerCase()}.svg`;
            return ["Champion", "Signature", "Token"].includes(v) ? path : undefined;
          }}
        />
      )}
      <FilterSection
        label="Domain"
        options={availableFilters.domains}
        selected={filterState.domains}
        onToggle={(v) => onToggleFilter("domains", v)}
        iconPath={(v) => `/icons/domains/${v.toLowerCase()}.${v === "Colorless" ? "svg" : "webp"}`}
        displayLabel={(v) => (v === "Colorless" ? "None" : v)}
      />
      {availableFilters.variants.length > 0 && (
        <FilterSection
          label="Version"
          options={availableFilters.variants}
          selected={filterState.variants}
          onToggle={(v) => onToggleFilter("variants", v)}
        />
      )}
    </>
  );

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
              className="pl-9"
            />
          </div>
          <div
            className={`flex items-center gap-2 overflow-hidden transition-all duration-200 ${
              showScopeChips ? "mt-2 max-h-10 opacity-100" : "mt-0 max-h-0 opacity-0"
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
          <span className="shrink-0 text-sm text-muted-foreground">
            {hasActiveFilters ? `${filteredCount} of ${totalCards}` : totalCards} cards
          </span>
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Mobile: Filters button that opens bottom sheet */}
          <Button
            variant="outline"
            size="sm"
            className="relative sm:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <SlidersHorizontal className="mr-2 size-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                variant="default"
                className="ml-2 size-5 justify-center rounded-full p-0 text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuCheckboxItem checked={showImages} onCheckedChange={onShowImagesChange}>
                Show card images
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cardFields.number}
                onCheckedChange={(v) => onCardFieldsChange({ number: v })}
              >
                Show number
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cardFields.title}
                onCheckedChange={(v) => onCardFieldsChange({ title: v })}
              >
                Show title
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cardFields.type}
                onCheckedChange={(v) => onCardFieldsChange({ type: v })}
              >
                Show type
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={cardFields.rarity}
                onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
              >
                Show rarity
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Desktop: inline filter sections */}
      <div className="hidden flex-wrap gap-4 sm:flex">{filterSections}</div>

      {/* Mobile: bottom sheet with filter sections */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] sm:hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow down the card list</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4">{filterSections}</div>
          <SheetFooter>
            <SheetClose asChild>
              <Button className="w-full">
                Done
                {activeFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 size-5 justify-center rounded-full p-0 text-xs"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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
    <div className="space-y-1.5">
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
              {icon &&
                (icon.endsWith(".svg") ? (
                  <span
                    className="inline-block size-3.5 bg-current"
                    style={{
                      maskImage: `url(${icon})`,
                      maskSize: "contain",
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                    }}
                  />
                ) : (
                  <img src={icon} alt="" className="size-3.5" />
                ))}
              {displayLabel ? displayLabel(option) : option}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
