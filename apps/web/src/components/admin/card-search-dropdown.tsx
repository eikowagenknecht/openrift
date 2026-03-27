import { useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Input
        placeholder={placeholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          onSearch(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget)) {
            setShowResults(false);
          }
        }}
        disabled={disabled}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
        autoFocus={autoFocus}
      />
      {showResults && search.length >= 2 && results.length > 0 && (
        <div className="bg-popover absolute top-full z-50 mt-1 max-h-60 w-max min-w-full overflow-y-auto rounded-md border shadow-md">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hover:bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50"
              onMouseDown={(e) => e.preventDefault()}
              disabled={disabled}
              onClick={() => {
                onSelect(item.id);
                setSearch(item.label);
                setShowResults(false);
              }}
            >
              <span className="truncate font-medium">{item.label}</span>
              {item.sublabel && (
                <span className="text-muted-foreground shrink-0 text-xs">{item.sublabel}</span>
              )}
              {item.detail && (
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {item.detail}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {showResults && search.length >= 2 && results.length === 0 && (
        <div className="bg-popover absolute top-full z-50 mt-1 w-full rounded-md border px-3 py-2 shadow-md">
          <p className="text-muted-foreground text-xs">No matching cards</p>
        </div>
      )}
    </div>
  );
}
