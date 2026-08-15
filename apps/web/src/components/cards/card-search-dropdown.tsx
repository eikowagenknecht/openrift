import type { ReactNode } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface CardSearchResult {
  id: string;
  label: string;
  sublabel?: string;
  detail?: string;
  /** Opt-in extra rendered right after the label (e.g. energy/power stats). */
  adornment?: ReactNode;
  /** Opt-in extra rendered before the label (e.g. the card's art thumbnail). */
  leading?: ReactNode;
}

/**
 * Autocomplete that searches cards by name. The parent owns the result set (it
 * runs the query on every `onSearch` call), so the Combobox does no internal
 * filtering — `autoComplete="none"` makes it render exactly the `results` it is
 * handed. Open/close, keyboard nav, and filling the input with the picked
 * label on selection are all handled by the BaseUI Combobox primitive, which
 * also supplies the ARIA combobox/listbox semantics.
 *
 * @returns A BaseUI Combobox wired for external/async filtering.
 */
export function CardSearchDropdown({
  results,
  onSearch,
  onSelect,
  placeholder = "Search card name…",
  disabled,
  className,
  autoFocus,
}: {
  results: CardSearchResult[];
  onSearch: (query: string) => void;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <Combobox<CardSearchResult>
      items={results}
      // Items are externally filtered: the parent re-queries on each keystroke
      // and hands back `results`, so the Combobox must not filter them again.
      autoComplete="none"
      itemToStringLabel={(item) => item.label}
      onInputValueChange={onSearch}
      onValueChange={(item) => {
        if (item) {
          onSelect(item.id);
        }
      }}
    >
      <ComboboxInput
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        showTrigger={false}
        showClear
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- opt-in via the autoFocus prop; callers pass it intentionally
        autoFocus={autoFocus}
      />
      {/* Grow to fit the card rows (label + sublabel + detail) instead of the
          narrow input width; the base max-w-(--available-width) still caps it. */}
      <ComboboxContent className="w-max">
        <ComboboxEmpty>No matching cards</ComboboxEmpty>
        <ComboboxList>
          {(item: CardSearchResult) => (
            <ComboboxItem key={item.id} value={item}>
              {item.leading}
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              {item.adornment}
              {item.sublabel ? (
                <span className="text-muted-foreground shrink-0">{item.sublabel}</span>
              ) : null}
              {item.detail ? (
                <span className="text-muted-foreground ml-auto shrink-0">{item.detail}</span>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
