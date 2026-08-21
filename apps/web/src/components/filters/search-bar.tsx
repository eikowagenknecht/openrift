import { ALL_SEARCH_FIELDS, searchPrefixFields } from "@openrift/shared";
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

  // Counts a prefix the user is still typing ("n:"), so the chip below swaps
  // over on the colon rather than waiting for the first letter of the term.
  const prefixFields = searchPrefixFields(localSearch);
  const hasPrefixes = prefixFields.length > 0;

  // The unit is already on the trailing count ("142 copies"), so the
  // placeholder doesn't repeat it — that just crowds the field on a phone.
  const placeholder = "Search...";

  // The scope persists across searches and sessions, so a forgotten
  // "keywords only" scope reads as broken search. Keep it visible as an
  // in-field chip whenever it's narrowed, with its own remove X that resets
  // to all fields — the input's clear X only clears the typed text. Explicit
  // n:/k: prefixes override the scope, so the read-only prefix chip stands in
  // for it while one is typed.
  const scopeNarrowed = !allSelected && !hasPrefixes;
  // An un-narrowed scope still needs a way in, so the chip also appears on
  // focus while the field is empty — the moment the user is deciding what to
  // search, and the only moment where growing the leading addon can't shove
  // typed text sideways. It stays put while its own menu is open, since that
  // menu takes the focus the chip is mounted on.
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
  // A typed prefix beats the picked scope for that term, so the chip reports
  // the prefix instead of a scope the query is ignoring.
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
      // Backspace on an empty field drops the scope chip, the way a chip
      // input deletes the token left of the caret.
      onBackspaceEmpty={scopeNarrowed ? selectAllSearchFields : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
