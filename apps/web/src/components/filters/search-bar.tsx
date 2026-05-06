import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const SEARCH_FIELD_LABELS: Record<SearchField, { label: string; prefix: string }> = {
  name: { label: "Name", prefix: "n:" },
  cardText: { label: "Card Text", prefix: "d:" },
  keywords: { label: "Keywords", prefix: "k:" },
  tags: { label: "Tags", prefix: "t:" },
  artist: { label: "Artist", prefix: "a:" },
  flavorText: { label: "Flavor Text", prefix: "f:" },
  type: { label: "Type", prefix: "ty:" },
  id: { label: "ID", prefix: "id:" },
};

interface SearchBarProps {
  totalCards: number;
  filteredCount: number;
}

export function SearchBar({ totalCards, filteredCount }: SearchBarProps) {
  const { filterState, searchScope, hasActiveFilters, view } = useFilterValues();
  const { setSearch, toggleSearchField, selectAllSearchFields, selectOnlySearchField } =
    useFilterActions();

  const allSelected = searchScope.length === ALL_SEARCH_FIELDS.length;

  const unitLabel = view === "cards" ? "cards" : view === "copies" ? "copies" : "printings";

  const [searchFocused, setSearchFocused] = useState(false);
  const filteredCountRef = useRef(filteredCount);
  useEffect(() => {
    filteredCountRef.current = filteredCount;
  }, [filteredCount]);

  const commitSearch = (value: string) => {
    setSearch(value);
    if (value) {
      trackEvent("search", { query: value, resultCount: filteredCountRef.current });
    }
  };

  const [localSearch, setLocalSearch] = useSearchUrlSync({
    urlValue: filterState.search,
    onCommit: commitSearch,
  });

  const showScopeChips = searchFocused;
  const hasPrefixes = parseSearchTerms(localSearch).some((t) => t.field !== null);

  const placeholder = allSelected
    ? "Search cards..."
    : `Search by ${searchScope.map((f) => SEARCH_FIELD_LABELS[f].label.toLowerCase()).join(", ")}...`;

  const cardCountLabel =
    hasActiveFilters && filteredCount !== totalCards
      ? `${filteredCount} / ${totalCards}`
      : String(totalCards);

  return (
    <div className="min-w-0 flex-1">
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder={placeholder}
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className={cn("pl-9", localSearch ? "pr-28" : "pr-20")}
        />
        <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
          <span className="text-muted-foreground pointer-events-none text-xs">
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
              <XIcon className="size-3.5" />
            </button>
          )}
        </span>
      </div>
      <div
        className={cn(
          "flex items-start gap-2 overflow-hidden transition-all duration-200",
          showScopeChips ? "mt-2 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0",
        )}
      >
        <span className="text-muted-foreground shrink-0 text-xs">Search in:</span>
        <div
          className={cn("flex flex-wrap gap-1", hasPrefixes && "pointer-events-none opacity-40")}
        >
          <Badge
            variant={allSelected ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={selectAllSearchFields}
          >
            All
          </Badge>
          {ALL_SEARCH_FIELDS.map((field) => {
            const { label, prefix } = SEARCH_FIELD_LABELS[field];
            const isActive = searchScope.includes(field);
            return (
              <Badge
                key={field}
                variant={allSelected ? "outline" : isActive ? "default" : "outline"}
                className={cn("cursor-pointer gap-1 text-xs", allSelected && "opacity-60")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (allSelected) {
                    selectOnlySearchField(field);
                  } else {
                    toggleSearchField(field);
                  }
                }}
              >
                <span className="text-2xs opacity-50">{prefix}</span>
                {label}
              </Badge>
            );
          })}
        </div>
      </div>
    </div>
  );
}
