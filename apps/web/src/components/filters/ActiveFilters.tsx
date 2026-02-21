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

  const filterGroups: { key: FilterKey; label: string; values: string[] }[] = [
    { key: "sets", label: "Set", values: filterState.sets },
    { key: "rarities", label: "Rarity", values: filterState.rarities },
    { key: "types", label: "Type", values: filterState.types },
    { key: "superTypes", label: "Super Type", values: filterState.superTypes },
    { key: "domains", label: "Domain", values: filterState.domains },
    { key: "variants", label: "Version", values: filterState.variants },
  ].filter((g): g is { key: FilterKey; label: string; values: string[] } => g.values.length > 0);

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
    <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
        {filterState.search && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Search:</span>
            <Badge variant="secondary" className="gap-1">
              &ldquo;{filterState.search}&rdquo;
              <button
                type="button"
                onClick={onClearSearch}
                className="ml-0.5 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}
        {filterGroups.map(({ key, label, values }) => (
          <div key={key} className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{label}:</span>
            {values.map((value) => {
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
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        onClick={onClearAll}
        title="Clear all filters"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
