import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { FilterBadgeSections } from "@/components/filters/filter-badge-sections";
import { FilterChipSections } from "@/components/filters/filter-chip-sections";
import { FilterRangeSections } from "@/components/filters/filter-range-sections";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCustomTagList } from "@/hooks/use-enums";
import { DEFAULT_TOP_LEVEL_UNITS, getApplicablePlacementUnits } from "@/lib/filter-sections";
import { cn } from "@/lib/utils";

export interface FilterPanelContentProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /**
   * Restricts the Custom Tags section to specific tag categories. Useful in
   * the deck builder where a tag-locked format only cares about one
   * category (e.g. Custom-Region → just "region") and other categories
   * would be noise. Omit (default) to show every category that has tags.
   */
  visibleCustomTagCategories?: ReadonlySet<string>;
  /** Override selected values for array filters (e.g. zone presets in the deck builder). */
  filterOverrides?: Partial<Record<string, string[]>>;
  /**
   * Per-dimension faceted counts. When present, each badge shows its match
   * count and zero-count options are dimmed. Omit to fall back to plain
   * unfaceted badges (deck builder, collection grid).
   */
  filterCounts?: FilterCounts;
  /**
   * Upper bound for the "Copies" owned-count range slider — the most copies the
   * user owns of any one card on this surface. Omit or pass 0 to hide the
   * slider (logged-out catalog, or surfaces where `"owned"` is hidden).
   */
  ownedCountMax?: number;
  /**
   * The user's top-level placement units (see `lib/filter-sections.ts`).
   * Units in this set render in the main panel body; every other applicable
   * unit renders inside the collapsed "More filters" fold at the bottom.
   * Omit to fall back to the default placement (SSR preview, stats page).
   */
  topLevelUnits?: ReadonlySet<string>;
}

/**
 * Partitions the applicable placement units of a surface into the top-level
 * set and the More set, mirroring what the panel / compact bar will render
 * where. Shared by `FilterPanelContent` and `CollapsibleFilterPanel` so their
 * fold gating stays identical.
 * @returns The top-level and More unit sets, plus whether the More fold has any content.
 */
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

/**
 * Collapsed-by-default host for the demoted ("in More") filter units at the
 * bottom of a vertical filter surface (sidebar, collapsible panel, mobile
 * drawer). Everything inside stays reachable in one click without crowding
 * the main panel body.
 * @returns The collapsible More-filters group.
 */
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
