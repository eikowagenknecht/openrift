import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActiveFiltersProps {
  filterState: {
    search: string;
    sets: string[];
    rarities: string[];
    types: string[];
    superTypes: string[];
    domains: string[];
    variants: string[];
  };
  hasActiveFilters: boolean;
  onToggleFilter: (
    key: "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants",
    value: string,
  ) => void;
  onClearAll: () => void;
  onClearSearch: () => void;
}

export function ActiveFilters({
  filterState,
  hasActiveFilters,
  onToggleFilter,
  onClearAll,
  onClearSearch,
}: ActiveFiltersProps) {
  if (!hasActiveFilters) {
    return null;
  }

  type FilterKey = "sets" | "rarities" | "types" | "superTypes" | "domains" | "variants";

  const allFilters: { key: FilterKey; value: string }[] = [
    ...filterState.sets.map((v) => ({ key: "sets" as const, value: v })),
    ...filterState.rarities.map((v) => ({ key: "rarities" as const, value: v })),
    ...filterState.types.map((v) => ({ key: "types" as const, value: v })),
    ...filterState.superTypes.map((v) => ({ key: "superTypes" as const, value: v })),
    ...filterState.domains.map((v) => ({ key: "domains" as const, value: v })),
    ...filterState.variants.map((v) => ({ key: "variants" as const, value: v })),
  ];

  const getIconPath = (key: FilterKey, value: string): string | undefined => {
    switch (key) {
      case "rarities": {
        return `/icons/rarities/${value.toLowerCase()}.webp`;
      }
      case "types": {
        return `/icons/types/${value.toLowerCase()}.svg`;
      }
      case "superTypes": {
        return ["Champion", "Signature", "Token"].includes(value)
          ? `/icons/supertypes/${value.toLowerCase()}.svg`
          : undefined;
      }
      case "domains": {
        return `/icons/domains/${value.toLowerCase()}.${value === "Colorless" ? "svg" : "webp"}`;
      }
      default: {
        return undefined;
      }
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
      {filterState.search && (
        <Badge variant="secondary" className="gap-1">
          Search: &ldquo;{filterState.search}&rdquo;
          <button type="button" onClick={onClearSearch} className="ml-0.5 hover:text-foreground">
            <X className="size-3" />
          </button>
        </Badge>
      )}
      {allFilters.map(({ key, value }) => {
        const icon = getIconPath(key, value);
        return (
          <Badge key={`${key}-${value}`} variant="secondary" className="gap-1">
            {icon &&
              (icon.endsWith(".svg") ? (
                <span
                  className="inline-block size-3.5 bg-current"
                  style={{
                    maskImage: `url(${icon})`,
                    maskSize: "contain",
                    maskRepeat: "no-repeat",
                    maskPosition: "center",
                  }}
                />
              ) : (
                <img src={icon} alt="" className="size-3.5" />
              ))}
            {value === "Colorless" ? "None" : value}
            <button
              type="button"
              onClick={() => onToggleFilter(key, value)}
              className="ml-0.5 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </Badge>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
