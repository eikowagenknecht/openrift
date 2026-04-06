import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CardSearchResult {
  id: string;
  label: string;
  sublabel?: string;
  detail?: string;
}

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
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const visible = showResults && search.length >= 2;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function scrollActiveIntoView(index: number) {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const item = list.children[index] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
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
          const item = results[activeIndex];
          onSelect(item.id);
          setSearch(item.label);
          setShowResults(false);
          setActiveIndex(-1);
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
    <div className={cn("relative", className)} ref={containerRef}>
      <Input
        role="combobox"
        aria-expanded={visible && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onSearch(event.target.value);
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
        disabled={disabled}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
        autoFocus={autoFocus}
      />
      {visible && results.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full z-50 mt-1 max-h-60 w-max min-w-full overflow-y-auto rounded-md border shadow-md"
        >
          {results.map((item, index) => (
            <button
              key={item.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50",
                index === activeIndex ? "bg-muted" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              disabled={disabled}
              onClick={() => {
                onSelect(item.id);
                setSearch(item.label);
                setShowResults(false);
                setActiveIndex(-1);
              }}
            >
              <span className="truncate font-medium">{item.label}</span>
              {item.sublabel && (
                <span className="text-muted-foreground shrink-0">{item.sublabel}</span>
              )}
              {item.detail && (
                <span className="text-muted-foreground ml-auto shrink-0">{item.detail}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {visible && results.length === 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full z-50 mt-1 w-full rounded-md border px-3 py-2 shadow-md"
        >
          <p className="text-muted-foreground">No matching cards</p>
        </div>
      )}
    </div>
  );
}
