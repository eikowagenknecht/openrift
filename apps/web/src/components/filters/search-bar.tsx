import { searchPrefixFields } from "@openrift/shared/filters";
import { ALL_SEARCH_FIELDS } from "@openrift/shared/types/search";
import { useEffect, useRef, useState } from "react";

import { SearchInput } from "@/components/filters/search-input";
import { SearchPrefixChip, SearchScopeChip } from "@/components/filters/search-scope-menu";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useSearchUrlSync } from "@/hooks/use-search-url-sync";
import { trackEvent } from "@/lib/analytics";

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
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Also matches a prefix with no term yet ("n:"), so the chip swaps on the colon.
  const prefixFields = searchPrefixFields(localSearch);
  const hasPrefixes = prefixFields.length > 0;

  const placeholder = "Search...";

  const scopeNarrowed = !allSelected && !hasPrefixes;
  const focusedAndEmpty = searchFocused && localSearch === "";
  const showScopeChip = !hasPrefixes && (scopeNarrowed || scopeMenuOpen || focusedAndEmpty);
  const scopeChip = showScopeChip ? (
    <SearchScopeChip
      scope={searchScope}
      toggleField={toggleSearchField}
      selectAll={selectAllSearchFields}
      selectOnly={selectOnlySearchField}
      open={scopeMenuOpen}
      onOpenChange={setScopeMenuOpen}
      inputRef={inputRef}
    />
  ) : undefined;
  const leadingChip = hasPrefixes ? <SearchPrefixChip fields={prefixFields} /> : scopeChip;

  const cardCountLabel =
    hasActiveFilters && filteredCount !== totalCards
      ? `${filteredCount} / ${totalCards}`
      : String(totalCards);

  return (
    <SearchInput
      className="min-w-0 flex-1"
      inputRef={inputRef}
      value={localSearch}
      onValueChange={setLocalSearch}
      onClear={() => {
        setLocalSearch("");
        setSearch("");
      }}
      placeholder={placeholder}
      leading={leadingChip}
      trailing={`${cardCountLabel} ${unitLabel}`}
      onFocus={() => setSearchFocused(true)}
      onBlur={() => setSearchFocused(false)}
      onBackspaceEmpty={scopeNarrowed ? selectAllSearchFields : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
