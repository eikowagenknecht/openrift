import type { AvailableFilters, FilterCounts } from "@openrift/shared/filters";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FilterBadgeSections } from "@/features/cards/components/filter-badge-sections";
import { FilterChipSections } from "@/features/cards/components/filter-chip-sections";
import { FilterRangeSections } from "@/features/cards/components/filter-range-sections";
import {
  DEFAULT_TOP_LEVEL_UNITS,
  getApplicablePlacementUnits,
} from "@/features/cards/lib/filter-sections";
import { useCustomTagList } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";

export interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** Restricts the Custom Tags section to specific categories. Omit to show every category with tags. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  /** Override selected values for array filters (e.g. zone presets in the deck builder). */
  filterOverrides?: Partial<Record<string, string[]>>;
  /** Per-dimension faceted counts. Omit to fall back to plain unfaceted badges. */
  filterCounts?: FilterCounts;
  /** Upper bound for the "Copies" slider. Omit or pass 0 to hide it. */
  ownedCountMax?: number;
  /** Units in this set render in the main panel body; the rest go in the "More filters" fold. */
  topLevelUnits?: ReadonlySet<string>;
}

function useFilterUnitPartition({
  availableFilters,
  availableLanguages,
  hiddenSections,
  visibleCustomTagCategories,
  topLevelUnits,
}: Pick<
  FilterPanelContentProps,
  | "availableFilters"
  | "availableLanguages"
  | "hiddenSections"
  | "visibleCustomTagCategories"
  | "topLevelUnits"
>): {
  topUnits: ReadonlySet<string>;
  moreUnits: ReadonlySet<string>;
  moreHasContent: boolean;
} {
  const { byCategory } = useCustomTagList();
  const customTagCategoryCount = [...byCategory.keys()].filter((category) =>
    visibleCustomTagCategories === undefined ? true : visibleCustomTagCategories.has(category),
  ).length;
  const topUnits = topLevelUnits ?? DEFAULT_TOP_LEVEL_UNITS;
  const applicable = getApplicablePlacementUnits({
    availableFilters,
    availableLanguages,
    surfaceHiddenSections: hiddenSections,
    customTagCategoryCount,
  });
  const moreUnits = new Set(applicable.map((unit) => unit.key).filter((key) => !topUnits.has(key)));
  return { topUnits, moreUnits, moreHasContent: moreUnits.size > 0 };
}

export function FilterPanelContent({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  ownedCountMax,
  topLevelUnits,
}: FilterPanelContentProps) {
  const { topUnits, moreUnits, moreHasContent } = useFilterUnitPartition({
    availableFilters,
    availableLanguages,
    hiddenSections,
    visibleCustomTagCategories,
    topLevelUnits,
  });
  const shared = {
    availableFilters,
    availableLanguages,
    setDisplayLabel,
    hiddenSections,
    visibleCustomTagCategories,
    filterOverrides,
    filterCounts,
  };
  return (
    <>
      <FilterBadgeSections {...shared} units={topUnits} />
      <FilterChipSections {...shared} units={topUnits} />
      <FilterRangeSections
        availableFilters={availableFilters}
        filterCounts={filterCounts}
        hiddenSections={hiddenSections}
        ownedCountMax={ownedCountMax}
        units={topUnits}
      />
      {moreHasContent && (
        <MoreFiltersFold>
          <FilterBadgeSections {...shared} units={moreUnits} />
          <FilterChipSections {...shared} units={moreUnits} />
          <FilterRangeSections
            availableFilters={availableFilters}
            filterCounts={filterCounts}
            hiddenSections={hiddenSections}
            ownedCountMax={ownedCountMax}
            units={moreUnits}
          />
        </MoreFiltersFold>
      )}
    </>
  );
}

function MoreFiltersFold({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2 gap-1"
          />
        }
      >
        <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
        More filters
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
