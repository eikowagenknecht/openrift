import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActiveFiltersProps {
  filterState: {
    search: string;
    sets: string[];
    rarities: string[];
    types: string[];
    domains: string[];
  };
  hasActiveFilters: boolean;
  totalCards: number;
  filteredCount: number;
  onToggleFilter: (key: "sets" | "rarities" | "types" | "domains", value: string) => void;
  onClearAll: () => void;
  onClearSearch: () => void;
}

export function ActiveFilters({
  filterState,
  hasActiveFilters,
  totalCards,
  filteredCount,
  onToggleFilter,
  onClearAll,
  onClearSearch,
}: ActiveFiltersProps) {
  if (!hasActiveFilters) {
    return null;
  }

  const allFilters: { key: "sets" | "rarities" | "types" | "domains"; value: string }[] = [
    ...filterState.sets.map((v) => ({ key: "sets" as const, value: v })),
    ...filterState.rarities.map((v) => ({ key: "rarities" as const, value: v })),
    ...filterState.types.map((v) => ({ key: "types" as const, value: v })),
    ...filterState.domains.map((v) => ({ key: "domains" as const, value: v })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        Showing {filteredCount} of {totalCards} cards
      </span>
      {filterState.search && (
        <Badge variant="secondary" className="gap-1">
          Search: &ldquo;{filterState.search}&rdquo;
          <button type="button" onClick={onClearSearch} className="ml-0.5 hover:text-foreground">
            <X className="size-3" />
          </button>
        </Badge>
      )}
      {allFilters.map(({ key, value }) => (
        <Badge key={`${key}-${value}`} variant="secondary" className="gap-1">
          {value}
          <button
            type="button"
            onClick={() => onToggleFilter(key, value)}
            className="ml-0.5 hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
