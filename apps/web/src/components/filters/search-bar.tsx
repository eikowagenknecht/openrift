import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, parseSearchTerms } from "@openrift/shared";
import { useEffect, useRef, useState } from "react";

import { SearchInput } from "@/components/filters/search-input";
import { Badge } from "@/components/ui/badge";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
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

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [popoverRightOffset, setPopoverRightOffset] = useState(0);
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) {
      return;
    }
    const parent = node.parentElement;
    if (!parent) {
      return;
    }
    const update = () => {
      const wrapRect = node.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      setPopoverRightOffset(Math.max(0, parentRect.right - wrapRect.right));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  const scopeLabels = searchScope.map((field) => SEARCH_FIELD_LABELS[field].label.toLowerCase());
  const placeholder = `Search ${unitLabel}...`;

  // The scope persists across searches and sessions, so a forgotten
  // "keywords only" scope reads as broken search. Keep it visible as an
  // in-field chip whenever it's narrowed, with its own remove X that resets
  // to all fields — the input's clear X only clears the typed text. Explicit
  // n:/k: prefixes override the scope, so the chip hides then (mirroring the
  // dimmed chips in the scope popover).
  const scopeSummary =
    scopeLabels.length > 2
      ? `${scopeLabels.slice(0, 2).join(", ")} +${scopeLabels.length - 2}`
      : scopeLabels.join(", ");
  const scopeChip =
    !allSelected && !hasPrefixes ? (
      <Badge variant="secondary" className="min-w-0 text-xs font-normal">
        <span className="min-w-0 truncate">in: {scopeSummary}</span>
        <ChipRemoveButton
          aria-label="Search in all fields"
          onMouseDown={(e) => e.preventDefault()}
          onClick={selectAllSearchFields}
        />
      </Badge>
    ) : undefined;

  const cardCountLabel =
    hasActiveFilters && filteredCount !== totalCards
      ? `${filteredCount} / ${totalCards}`
      : String(totalCards);

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      <SearchInput
        value={localSearch}
        onValueChange={setLocalSearch}
        onClear={() => {
          setLocalSearch("");
          setSearch("");
        }}
        placeholder={placeholder}
        leading={scopeChip}
        trailing={`${cardCountLabel} ${unitLabel}`}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
      <div
        style={{ right: -popoverRightOffset }}
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 absolute top-full left-0 z-30 mt-2 flex items-start gap-2 rounded-lg p-2.5 shadow-md ring-1 transition-[opacity,transform] duration-150",
          showScopeChips
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
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
