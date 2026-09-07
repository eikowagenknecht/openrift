import { useDebouncedCallback } from "@tanstack/react-pacer";
import type { ReactNode, RefObject } from "react";
import { useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { CardSearchResult } from "@/lib/card-search-result";

const SEARCH_DEBOUNCE_MS = 150;

interface CatalogSearchComboboxProps<T> {
  results: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  onQueryChange: (query: string) => void;
  itemToInputValue?: (item: T) => string;
  renderActivePreview?: (item: T, anchorRef: RefObject<HTMLElement | null>) => ReactNode;
  onRawInputChange?: (value: string) => void;
  initialQuery?: string;
  ariaLabel?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

/**
 * `filter={null}` disables BaseUI's own label filter (`autoComplete="none"`
 * does not, despite its docs); items are already filtered externally.
 */
export function CatalogSearchCombobox<T>({
  results,
  getKey,
  renderItem,
  onSelect,
  onQueryChange,
  itemToInputValue,
  renderActivePreview,
  onRawInputChange,
  initialQuery,
  ariaLabel,
  placeholder = "Search card name…",
  emptyMessage = "No matching cards",
  disabled,
  className,
  autoFocus,
}: CatalogSearchComboboxProps<T>) {
  const [highlighted, setHighlighted] = useState<T | null>(null);
  // State, not a ref: React Compiler flags refs passed to functions during
  // render, and the preview only reads `.current` in its own effect.
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const notifyQueryChange = useDebouncedCallback(onQueryChange, { wait: SEARCH_DEBOUNCE_MS });

  const handleInputValueChange = (value: string) => {
    onRawInputChange?.(value);
    notifyQueryChange(value);
  };

  return (
    <Combobox<T>
      items={results}
      filter={null}
      autoComplete="none"
      defaultInputValue={initialQuery}
      itemToStringLabel={itemToInputValue}
      onInputValueChange={handleInputValueChange}
      onItemHighlighted={(item) => setHighlighted(item ?? null)}
      onValueChange={(item) => {
        if (item) {
          onSelect(item);
        }
      }}
    >
      <ComboboxInput
        aria-label={ariaLabel}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        showTrigger={false}
        showClear
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- opt-in via the autoFocus prop; callers pass it intentionally
        autoFocus={autoFocus}
      />
      <ComboboxContent ref={setPopupEl} className="w-max">
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(item: T) => (
            <ComboboxItem key={getKey(item)} value={item}>
              {renderItem(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
      {highlighted !== null && renderActivePreview?.(highlighted, { current: popupEl })}
    </Combobox>
  );
}

function CardSearchRow({ result }: { result: CardSearchResult }) {
  return (
    <>
      {result.leading}
      <span className="min-w-0 truncate font-medium">{result.label}</span>
      {result.adornment}
      {result.sublabel ? (
        <span className="text-muted-foreground shrink-0">{result.sublabel}</span>
      ) : null}
      {result.detail ? (
        <span className="text-muted-foreground ml-auto shrink-0">{result.detail}</span>
      ) : null}
    </>
  );
}

export function CardSearchDropdown<T extends CardSearchResult = CardSearchResult>({
  results,
  onSearch,
  onSelect,
  ...rest
}: Omit<
  CatalogSearchComboboxProps<T>,
  "getKey" | "renderItem" | "onSelect" | "onQueryChange" | "itemToInputValue"
> & {
  onSearch: (query: string) => void;
  onSelect: (id: string, result: T) => void;
}) {
  return (
    <CatalogSearchCombobox<T>
      results={results}
      getKey={(result) => result.id}
      renderItem={(result) => <CardSearchRow result={result} />}
      itemToInputValue={(result) => result.label}
      onQueryChange={onSearch}
      onSelect={(result) => onSelect(result.id, result)}
      {...rest}
    />
  );
}
