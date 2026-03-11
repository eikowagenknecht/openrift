import type { AvailableFilters, RangeKey, SearchField, SortOption } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Eye,
  Minus,
  Plus,
  Square,
  SquareStack,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CardIcon } from "@/components/card-icon";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
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
import { Slider } from "@/components/ui/slider";
import { useCardFilters } from "@/hooks/use-card-filters";
import { useDebounce } from "@/hooks/use-debounce";
import type { CardFields } from "@/lib/card-fields";
import { formatDomainFilterLabel } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { useDisplayStore } from "@/stores/display-store";

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

const ART_VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  altart: "Alt Art",
  overnumbered: "Overnumbered",
};

const FINISH_LABELS: Record<string, string> = {
  normal: "Normal",
  foil: "Foil",
};

const RANGE_SECTIONS: {
  key: RangeKey;
  label: string;
  step?: number;
  formatValue?: (v: number) => string;
}[] = [
  { key: "energy", label: "Energy" },
  { key: "might", label: "Might" },
  { key: "power", label: "Power" },
  { key: "price", label: "Price", step: 1, formatValue: (v) => `$${v}` },
];

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
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[160px]" aria-label="Sort by">
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
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? (
                <ArrowDownNarrowWide className="size-4" />
              ) : (
                <ArrowUpNarrowWide className="size-4" />
              )}
            </Button>

            {/* View mode toggle */}
            <ButtonGroup aria-label="View mode">
              <Button
                variant={view === "cards" ? "default" : "outline"}
                size="icon"
                onClick={() => setView("cards")}
                title="One per card"
              >
                <Square className="size-4" />
              </Button>
              <Button
                variant={view === "printings" ? "default" : "outline"}
                size="icon"
                onClick={() => setView("printings")}
                title="Every printing"
              >
                <SquareStack className="size-4" />
              </Button>
            </ButtonGroup>

            {/* Columns stepper */}
            <ButtonGroup aria-label="Columns">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (maxColumns === null) {
                    const next = autoColumns - 1;
                    if (next >= minColumns) {
                      setMaxColumns(next);
                    }
                  } else {
                    if (maxColumns > minColumns) {
                      setMaxColumns(maxColumns - 1);
                    }
                  }
                }}
                disabled={
                  (maxColumns !== null && maxColumns <= minColumns) ||
                  (maxColumns === null && autoColumns <= minColumns)
                }
                aria-label="Fewer columns"
              >
                <Minus className="size-4" />
              </Button>
              <ButtonGroupText
                className="min-w-10 cursor-pointer justify-center tabular-nums"
                onClick={() => {
                  if (maxColumns !== null) {
                    setMaxColumns(null);
                  }
                }}
                title={maxColumns === null ? "Auto columns" : "Reset to auto"}
              >
                {maxColumns === null ? "Auto" : maxColumns}
              </ButtonGroupText>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const next = maxColumns === null ? autoColumns + 1 : maxColumns + 1;
                  if (next <= maxColumnsLimit) {
                    setMaxColumns(next);
                  }
                }}
                disabled={
                  maxColumns === null
                    ? autoColumns >= maxColumnsLimit
                    : maxColumns >= maxColumnsLimit
                }
                aria-label="More columns"
              >
                <Plus className="size-4" />
              </Button>
            </ButtonGroup>

            {/* Display settings */}
            <DisplaySettingsDropdown
              showImages={showImages}
              onShowImagesChange={setShowImages}
              richEffects={richEffects}
              onRichEffectsChange={setRichEffects}
              cardFields={cardFields}
              onCardFieldsChange={(update) => setCardFields((prev) => ({ ...prev, ...update }))}
            />
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
            {/* Options: sort + display */}
            <div className="space-y-2.5">
              <p className="text-sm font-medium">Options</p>
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger size="sm" className="flex-1 text-xs" aria-label="Sort by">
                    <span className="text-muted-foreground">Sort:&nbsp;</span>
                    <SelectValue placeholder="Sort by">
                      {(value: string) =>
                        sortOptions.find((o) => o.value === value)?.label ?? value
                      }
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
                  size="sm"
                  className="size-7 p-0"
                  onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                  title={sortDir === "asc" ? "Ascending" : "Descending"}
                >
                  {sortDir === "asc" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <ButtonGroup aria-label="View mode" className="mr-auto">
                  <Button
                    variant={view === "cards" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setView("cards")}
                  >
                    <Square />
                    Cards
                  </Button>
                  <Button
                    variant={view === "printings" ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setView("printings")}
                  >
                    <SquareStack />
                    Printings
                  </Button>
                </ButtonGroup>

                <ButtonGroup aria-label="Columns">
                  <Button
                    variant="outline"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => {
                      if (maxColumns === null) {
                        const next = autoColumns - 1;
                        if (next >= minColumns) {
                          setMaxColumns(next);
                        }
                      } else {
                        if (maxColumns > minColumns) {
                          setMaxColumns(maxColumns - 1);
                        }
                      }
                    }}
                    disabled={
                      (maxColumns !== null && maxColumns <= minColumns) ||
                      (maxColumns === null && autoColumns <= minColumns)
                    }
                    aria-label="Fewer columns"
                  >
                    <Minus />
                  </Button>
                  <ButtonGroupText
                    className="flex min-w-7 cursor-pointer items-center justify-center text-xs tabular-nums"
                    onClick={() => {
                      if (maxColumns !== null) {
                        setMaxColumns(null);
                      }
                    }}
                    title={maxColumns === null ? "Auto columns" : "Reset to auto"}
                  >
                    {maxColumns === null ? "Auto" : maxColumns}
                  </ButtonGroupText>
                  <Button
                    variant="outline"
                    size="sm"
                    className="size-7 p-0"
                    onClick={() => {
                      const next = maxColumns === null ? autoColumns + 1 : maxColumns + 1;
                      if (next <= maxColumnsLimit) {
                        setMaxColumns(next);
                      }
                    }}
                    disabled={
                      maxColumns === null
                        ? autoColumns >= maxColumnsLimit
                        : maxColumns >= maxColumnsLimit
                    }
                    aria-label="More columns"
                  >
                    <Plus />
                  </Button>
                </ButtonGroup>
              </div>
            </div>

            {/* Display */}
            <div className="space-y-2.5">
              <p className="text-sm font-medium">Display</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={showImages ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setShowImages(!showImages)}
                >
                  Card images
                </Badge>
                <Badge
                  variant={richEffects ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setRichEffects(!richEffects)}
                >
                  Rich effects
                </Badge>
                <Badge
                  variant={cardFields.number ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCardFields((prev) => ({ ...prev, number: !prev.number }))}
                >
                  ID
                </Badge>
                <Badge
                  variant={cardFields.title ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCardFields((prev) => ({ ...prev, title: !prev.title }))}
                >
                  Title
                </Badge>
                <Badge
                  variant={cardFields.type ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCardFields((prev) => ({ ...prev, type: !prev.type }))}
                >
                  Type
                </Badge>
                <Badge
                  variant={cardFields.rarity ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCardFields((prev) => ({ ...prev, rarity: !prev.rarity }))}
                >
                  Rarity
                </Badge>
                <Badge
                  variant={cardFields.price ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCardFields((prev) => ({ ...prev, price: !prev.price }))}
                >
                  Price
                </Badge>
              </div>
            </div>

            {/* Filters */}
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

export interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  layout?: "inline" | "drawer";
}

export function FilterPanelContent({
  availableFilters,
  setDisplayLabel,
  layout = "inline",
}: FilterPanelContentProps) {
  const { filterState, ranges, toggleArrayFilter, toggleSigned, togglePromo, setRange } =
    useCardFilters();
  return (
    <>
      <FilterSection
        label="Set"
        options={availableFilters.sets}
        selected={filterState.sets}
        onToggle={(v) => toggleArrayFilter("sets", v)}
        displayLabel={setDisplayLabel}
        layout={layout}
      />
      <FilterSection
        label="Domain"
        options={availableFilters.domains}
        selected={filterState.domains}
        onToggle={(v) => toggleArrayFilter("domains", v)}
        iconPath={(v) => getFilterIconPath("domains", v)}
        displayLabel={formatDomainFilterLabel}
        layout={layout}
      />
      <FilterSection
        label="Type"
        options={availableFilters.types}
        selected={filterState.types}
        onToggle={(v) => toggleArrayFilter("types", v)}
        iconPath={(v) => getFilterIconPath("types", v)}
        layout={layout}
      />
      {availableFilters.superTypes.length > 0 && (
        <FilterSection
          label="Super Type"
          options={availableFilters.superTypes}
          selected={filterState.superTypes}
          onToggle={(v) => toggleArrayFilter("superTypes", v)}
          iconPath={(v) => getFilterIconPath("superTypes", v)}
          layout={layout}
        />
      )}
      <FilterSection
        label="Rarity"
        options={availableFilters.rarities}
        selected={filterState.rarities}
        onToggle={(v) => toggleArrayFilter("rarities", v)}
        iconPath={(v) => getFilterIconPath("rarities", v)}
        layout={layout}
      />
      {availableFilters.artVariants.length > 1 && (
        <FilterSection
          label="Art Variant"
          options={availableFilters.artVariants}
          selected={filterState.artVariants}
          onToggle={(v) => toggleArrayFilter("artVariants", v)}
          displayLabel={(v) => ART_VARIANT_LABELS[v] ?? v}
          layout={layout}
        />
      )}
      {availableFilters.finishes.length > 1 && (
        <FilterSection
          label="Finish"
          options={availableFilters.finishes}
          selected={filterState.finishes}
          onToggle={(v) => toggleArrayFilter("finishes", v)}
          displayLabel={(v) => FINISH_LABELS[v] ?? v}
          layout={layout}
        />
      )}
      {(availableFilters.hasSigned || availableFilters.hasPromo) && (
        <div className={layout === "drawer" ? "flex min-w-0 gap-2" : "block space-y-1.5"}>
          <p
            className={`text-xs font-medium text-muted-foreground ${
              layout === "drawer" ? "w-16 shrink-0 pt-1" : ""
            }`}
          >
            Special
          </p>
          <div className="flex flex-1 flex-wrap gap-1">
            {availableFilters.hasSigned && (
              <Badge
                variant={filterState.signed === null ? "outline" : "default"}
                className="cursor-pointer"
                onClick={toggleSigned}
              >
                {filterState.signed === "false" ? "Not Signed" : "Signed"}
              </Badge>
            )}
            {availableFilters.hasPromo && (
              <Badge
                variant={filterState.promo === null ? "outline" : "default"}
                className="cursor-pointer"
                onClick={togglePromo}
              >
                {filterState.promo === "false" ? "Not Promo" : "Promo"}
              </Badge>
            )}
          </div>
        </div>
      )}
      <div
        className={layout === "drawer" ? "flex flex-col gap-3" : "flex flex-row flex-wrap gap-4"}
      >
        {RANGE_SECTIONS.map(({ key, label, ...rest }) => {
          const available = availableFilters[key];
          const show = key === "price" ? available.max > 0 : available.min !== available.max;
          if (!show) {
            return null;
          }
          return (
            <RangeFilterSection
              key={key}
              label={label}
              availableMin={available.min}
              availableMax={available.max}
              selectedMin={ranges[key].min}
              selectedMax={ranges[key].max}
              onChange={(min, max) => setRange(key, min, max)}
              layout={layout}
              {...rest}
            />
          );
        })}
      </div>
    </>
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
  layout = "inline",
}: {
  label: string;
  availableMin: number;
  availableMax: number;
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  step?: number;
  formatValue?: (value: number) => string;
  layout?: "inline" | "drawer";
}) {
  const resolvedMin = selectedMin ?? availableMin;
  const resolvedMax = selectedMax ?? availableMax;
  const fmt = formatValue ?? String;

  return (
    <div className={layout === "drawer" ? "flex min-w-0 items-center gap-2" : "block space-y-1.5"}>
      <p
        className={`text-xs font-medium text-muted-foreground ${layout === "drawer" ? "w-16 shrink-0" : ""}`}
      >
        {label}
      </p>
      <div className={`flex items-center gap-1.5 ${layout === "drawer" ? "flex-1" : "w-36"}`}>
        <span className="shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {fmt(resolvedMin)}
        </span>
        <Slider
          min={availableMin}
          max={availableMax}
          step={step}
          value={[resolvedMin, resolvedMax]}
          aria-label={`${label} range`}
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

function DisplaySettingsDropdown({
  showImages,
  onShowImagesChange,
  richEffects,
  onRichEffectsChange,
  cardFields: fields,
  onCardFieldsChange,
}: {
  showImages: boolean;
  onShowImagesChange: (v: boolean) => void;
  richEffects: boolean;
  onRichEffectsChange: (v: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" aria-label="Display settings" />}
      >
        <Eye className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem checked={showImages} onCheckedChange={onShowImagesChange}>
          Show card images
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={richEffects} onCheckedChange={onRichEffectsChange}>
          Rich effects
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={fields.number}
          onCheckedChange={(v) => onCardFieldsChange({ number: v })}
        >
          Show ID
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.title}
          onCheckedChange={(v) => onCardFieldsChange({ title: v })}
        >
          Show title
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.type}
          onCheckedChange={(v) => onCardFieldsChange({ type: v })}
        >
          Show type
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.rarity}
          onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
        >
          Show rarity
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fields.price}
          onCheckedChange={(v) => onCardFieldsChange({ price: v })}
        >
          Show price
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
  iconPath,
  displayLabel,
  layout = "inline",
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string | undefined;
  displayLabel?: (value: string) => string;
  layout?: "inline" | "drawer";
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className={layout === "drawer" ? "flex min-w-0 gap-2" : "block space-y-1.5"}>
      <p
        className={`text-xs font-medium text-muted-foreground ${
          layout === "drawer" ? "w-16 shrink-0 pt-1" : ""
        }`}
      >
        {label}
      </p>
      <div className="flex flex-1 flex-wrap gap-1">
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
