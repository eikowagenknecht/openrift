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

/** How long typing settles before the surface is asked to re-query. */
const SEARCH_DEBOUNCE_MS = 150;

export interface CardSearchResult {
  id: string;
  label: string;
  /** Secondary text after the label (slug, short code, printing variant…). */
  sublabel?: ReactNode;
  /** Trailing text, pushed to the row's right edge. */
  detail?: ReactNode;
  /** Opt-in extra rendered right after the label (e.g. energy/power stats). */
  adornment?: ReactNode;
  /**
   * Opt-in thumbnail rendered before the label. Card-scoped pickers pass
   * `CardThumbnail`, printing-scoped ones `PrintingThumbnail`; surfaces backed
   * by a list with no images (the admin endpoints) pass nothing and get the
   * same row without the picture.
   */
  leading?: ReactNode;
}

interface CatalogSearchComboboxProps<T> {
  /**
   * The rows to show. The surface re-queries whenever `onQueryChange` fires and
   * hands back a fresh list, so the combobox never filters on its own.
   */
  results: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  /**
   * The debounced query. Fires after typing settles, so surfaces no longer
   * each wire up their own debounce.
   */
  onQueryChange: (query: string) => void;
  /** Fills the input with this string when an item is picked. */
  itemToInputValue?: (item: T) => string;
  /**
   * Renders a floating preview for the highlighted item (hover or keyboard).
   * `anchorRef` points at the dropdown so the preview can sit beside it. Omit
   * when a surface has no preview.
   */
  renderActivePreview?: (item: T, anchorRef: RefObject<HTMLElement | null>) => ReactNode;
  /**
   * Reports every keystroke undebounced. Only for fields where the raw text is
   * itself valid input (an unknown card name that becomes a placeholder), not
   * for driving the result query.
   */
  onRawInputChange?: (value: string) => void;
  /** Pre-fills the input, e.g. with the text being corrected. */
  initialQuery?: string;
  ariaLabel?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

/**
 * The app's one card/printing autocomplete. Every picker that searches the
 * catalog, a deck zone, or an admin card list renders this: the collection and
 * deck import correction flows, deck check, the deck plan editor, the contribute
 * form, and the admin assign/link/tag/mapping pickers.
 *
 * Items are filtered externally — the surface re-queries on `onQueryChange` and
 * passes `results` back — so `autoComplete="none"` makes BaseUI render exactly
 * what it is handed. Open/close, keyboard navigation, highlight tracking, and
 * the ARIA combobox/listbox semantics all come from the BaseUI primitive. This
 * replaced a hand-rolled listbox that reimplemented all of that (and needed
 * three lint suppressions to do it).
 *
 * @returns A BaseUI Combobox wired for external filtering.
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
  // The popup is tracked in state rather than a ref so the anchor handed to
  // `renderActivePreview` is a plain object. React Compiler flags refs passed
  // to functions during render; the preview only reads `.current` inside its
  // own positioning effect, so a state-derived object is equivalent.
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);
  const notifyQueryChange = useDebouncedCallback(onQueryChange, { wait: SEARCH_DEBOUNCE_MS });

  const handleInputValueChange = (value: string) => {
    onRawInputChange?.(value);
    notifyQueryChange(value);
  };

  return (
    <Combobox<T>
      items={results}
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
      {/* Grow to fit the rows instead of the narrow input width; the base
          max-w-(--available-width) still caps it. */}
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

/**
 * One row of the standard card layout: thumbnail, name, then the secondary and
 * trailing text. Shared so a picker backed by an image-less list renders an
 * identical row minus the picture.
 * @returns The row's contents.
 */
export function CardSearchRow({ result }: { result: CardSearchResult }) {
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

/**
 * {@link CatalogSearchCombobox} specialized to the standard card row, which is
 * what most pickers want. Reach for the generic version only when a surface
 * needs a row shape this one can't express.
 *
 * @returns The card autocomplete.
 */
export function CardSearchDropdown({
  results,
  onSearch,
  onSelect,
  ...rest
}: Omit<
  CatalogSearchComboboxProps<CardSearchResult>,
  "getKey" | "renderItem" | "onSelect" | "onQueryChange" | "itemToInputValue"
> & {
  /** The debounced query; the combobox owns the debounce. */
  onSearch: (query: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <CatalogSearchCombobox<CardSearchResult>
      results={results}
      getKey={(result) => result.id}
      renderItem={(result) => <CardSearchRow result={result} />}
      itemToInputValue={(result) => result.label}
      onQueryChange={onSearch}
      onSelect={(result) => onSelect(result.id)}
      {...rest}
    />
  );
}
