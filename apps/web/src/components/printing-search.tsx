import type { Printing } from "@openrift/shared";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useId, useRef, useState } from "react";

import type { EnumLabels } from "@/hooks/use-enums";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Formats a printing label for import/search contexts. Shows the card ID plus
 * the variant label (unless it's "Standard", in which case just the ID).
 * @returns A formatted string like "RB1-042 · Foil" or just "RB1-042".
 */
export function formatImportPrintingLabel(printing: Printing, labels: EnumLabels): string {
  const label = formatPrintingLabel(printing, undefined, labels);
  if (label === "Standard") {
    return formatCardId(printing);
  }
  return `${formatCardId(printing)} · ${label}`;
}

/**
 * An accessible combobox that searches the full printing catalog by card name
 * or short code, with keyboard navigation and debounced filtering.
 * @returns A combobox element for searching and selecting printings.
 */
export function PrintingSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (printing: Printing) => void;
}) {
  const { labels } = useEnumOrders();
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [debouncedSearch] = useDebouncedValue(search, { wait: 150 });

  const results =
    debouncedSearch.length >= 2
      ? allPrintings
          .filter((printing) => {
            const query = debouncedSearch.toLowerCase();
            return (
              printing.card.name.toLowerCase().includes(query) ||
              printing.shortCode.toLowerCase().includes(query)
            );
          })
          .slice(0, 20)
      : [];

  const visible = showResults && search.length >= 2;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function scrollActiveIntoView(index: number) {
    const item = listRef.current?.children[index] as HTMLElement | undefined;
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
          onSelect(results[activeIndex]);
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
    <div className="relative" ref={containerRef}>
      <input
        role="combobox"
        aria-expanded={visible && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        placeholder="Search catalog..."
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
        className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring h-7 w-44 rounded-md border px-2 text-xs focus:ring-1 focus:outline-none"
      />
      {visible && results.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 max-h-60 w-max min-w-full overflow-y-auto rounded-md border shadow-md"
        >
          {results.map((printing, index) => (
            <button
              key={printing.id}
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
              onClick={() => {
                onSelect(printing);
                setShowResults(false);
                setActiveIndex(-1);
              }}
            >
              <span className="truncate font-medium">{printing.card.name}</span>
              <span className="text-muted-foreground shrink-0">
                {formatImportPrintingLabel(printing, labels)}
              </span>
            </button>
          ))}
        </div>
      )}
      {visible && results.length === 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 w-full rounded-md border px-3 py-2 shadow-md"
        >
          <p className="text-muted-foreground text-xs">No matching cards</p>
        </div>
      )}
    </div>
  );
}
