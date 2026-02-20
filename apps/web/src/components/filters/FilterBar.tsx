import type { AvailableFilters, SortOption } from "@openrift/shared";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";

interface FilterBarProps {
  availableFilters: AvailableFilters;
  filterState: {
    search: string;
    sets: string[];
    rarities: string[];
    types: string[];
    domains: string[];
  };
  sortBy: SortOption;
  onSearchChange: (search: string) => void;
  onToggleFilter: (key: "sets" | "rarities" | "types" | "domains", value: string) => void;
  onSortChange: (sort: SortOption) => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "cost", label: "Cost" },
  { value: "rarity", label: "Rarity" },
  { value: "collectorNumber", label: "Collector #" },
];

export function FilterBar({
  availableFilters,
  filterState,
  sortBy,
  onSearchChange,
  onToggleFilter,
  onSortChange,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(filterState.search);
  const debouncedSearch = useDebounce(localSearch, 200);

  useEffect(() => {
    if (debouncedSearch !== filterState.search) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, filterState.search, onSearchChange]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-4">
        <FilterSection
          label="Set"
          options={availableFilters.sets}
          selected={filterState.sets}
          onToggle={(v) => onToggleFilter("sets", v)}
        />
        <FilterSection
          label="Rarity"
          options={availableFilters.rarities}
          selected={filterState.rarities}
          onToggle={(v) => onToggleFilter("rarities", v)}
        />
        <FilterSection
          label="Type"
          options={availableFilters.types}
          selected={filterState.types}
          onToggle={(v) => onToggleFilter("types", v)}
        />
        <FilterSection
          label="Domain"
          options={availableFilters.domains}
          selected={filterState.domains}
          onToggle={(v) => onToggleFilter("domains", v)}
        />
      </div>
    </div>
  );
}

function FilterSection({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Badge
            key={option}
            variant={selected.includes(option) ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => onToggle(option)}
          >
            {option}
          </Badge>
        ))}
      </div>
    </div>
  );
}
