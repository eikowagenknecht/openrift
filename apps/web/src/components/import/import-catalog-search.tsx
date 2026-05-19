import { useDebouncedValue } from "@tanstack/react-pacer";
import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ImportCatalogSearchProps<T> {
  ariaLabel: string;
  placeholder: string;
  /** Pre-filtered, deduplicated, ranked, and length-capped list of items to show for `query`. */
  getResults: (query: string) => T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
}

const MIN_QUERY_LENGTH = 2;

/**
 * Inline always-visible search combobox for picking a catalog item (printing,
 * card, etc.) from a typeahead list. Shared by the collection-import and
 * deck-import correction flows; each surface passes its own `getResults` and
 * item renderer for the domain it cares about.
 *
 * Uses the shadcn `<Input>` primitive so its `text-base md:text-sm` default
 * avoids iOS Safari's input auto-zoom without per-instance overrides.
 * @returns An ARIA combobox with a typeahead input and a dropdown of results.
 */
export function ImportCatalogSearch<T>({
  ariaLabel,
  placeholder,
  getResults,
  getKey,
  renderItem,
  onSelect,
}: ImportCatalogSearchProps<T>) {
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });

  const results = debouncedSearch.length >= MIN_QUERY_LENGTH ? getResults(debouncedSearch) : [];
  const visible = showResults && search.length >= MIN_QUERY_LENGTH;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function scrollActiveIntoView(index: number) {
    const item = listRef.current?.children[index] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }

  function handleSelect(item: T) {
    onSelect(item);
    setShowResults(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!visible || results.length === 0) {
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = activeIndex < results.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(next);
        scrollActiveIntoView(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev = activeIndex > 0 ? activeIndex - 1 : results.length - 1;
        setActiveIndex(prev);
        scrollActiveIntoView(prev);
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        }
        break;
      }
      case "Escape": {
        event.preventDefault();
        setShowResults(false);
        setActiveIndex(-1);
        break;
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Input
        role="combobox"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-expanded={visible && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setShowResults(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget)) {
            setShowResults(false);
            setActiveIndex(-1);
          }
        }}
        onKeyDown={handleKeyDown}
        className="h-7 w-44"
      />
      {visible && results.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- ARIA combobox pattern with autocomplete
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 max-h-60 w-max min-w-full overflow-y-auto rounded-md border shadow-md"
        >
          {results.map((item, index) => (
            <button
              key={getKey(item)}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                index === activeIndex ? "bg-muted" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(item)}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
      {visible && results.length === 0 && (
        <div
          id={listboxId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- ARIA combobox pattern with autocomplete
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 w-full rounded-md border px-3 py-2 shadow-md"
        >
          <p className="text-muted-foreground text-xs">No matching cards</p>
        </div>
      )}
    </div>
  );
}
