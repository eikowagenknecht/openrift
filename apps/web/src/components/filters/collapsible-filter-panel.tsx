import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { FunnelIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useFilterValues } from "@/hooks/use-card-filters";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { FilterCustomizeControl } from "./filter-customize-control";
import { FilterBadgeSections, FilterRangeSections } from "./filter-panel-content";

interface CollapsibleFilterPanelProps {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
  /** See {@link FilterPanelContentProps.visibleCustomTagCategories}. */
  visibleCustomTagCategories?: ReadonlySet<string>;
  filterOverrides?: Partial<Record<string, string[]>>;
  filterCounts?: FilterCounts;
  /** See {@link FilterPanelContentProps.ownedCountMax}. */
  ownedCountMax?: number;
}

/**
 * Inline filter panel for mid-width screens (sm but not @wide).
 * Controlled by the `filtersExpanded` display store flag;
 * pair with `<FilterToggleButton>` in the toolbar row.
 * @returns The collapsible filter content, or null when collapsed.
 */
export function CollapsibleFilterPanel({
  availableFilters,
  availableLanguages,
  setDisplayLabel,
  hiddenSections,
  visibleCustomTagCategories,
  filterOverrides,
  filterCounts,
  ownedCountMax,
}: CollapsibleFilterPanelProps) {
  const filtersExpanded = useDisplayStore((state) => state.filtersExpanded);
  const setFiltersExpanded = useDisplayStore((state) => state.setFiltersExpanded);

  return (
    <Collapsible
      open={filtersExpanded}
      onOpenChange={setFiltersExpanded}
      className="@wide:hidden mb-3 hidden sm:block"
    >
      <CollapsibleContent className="group relative flex h-(--collapsible-panel-height) flex-col gap-3 overflow-hidden transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 lg:grid-cols-2">
          <FilterBadgeSections
            availableFilters={availableFilters}
            availableLanguages={availableLanguages}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={hiddenSections}
            visibleCustomTagCategories={visibleCustomTagCategories}
            filterOverrides={filterOverrides}
            filterCounts={filterCounts}
          />
        </div>
        <div className="grid grid-cols-2 items-start gap-x-6 gap-y-3 lg:grid-cols-4">
          <FilterRangeSections
            availableFilters={availableFilters}
            filterCounts={filterCounts}
            hiddenSections={hiddenSections}
            ownedCountMax={ownedCountMax}
          />
        </div>
        {/* Overlay the top-right corner (the first row leaves slack there).
            bg-background covers any chip behind it on unusually dense rows.
            Absolute, so flex `gap` skips it — no stray gap is added, and the
            range grid keeps its margin-free bottom (no doubled bottom padding). */}
        <FilterCustomizeControl
          revealOnHover
          className="bg-background absolute top-1 right-1 z-10"
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Toggle button for the filter panel, intended for the toolbar row.
 * Shows an active-filter dot when filters are set and the panel is collapsed.
 * @returns The filter toggle button.
 */
export function FilterToggleButton({ className }: { className?: string }) {
  const filtersExpanded = useDisplayStore((state) => state.filtersExpanded);
  const setFiltersExpanded = useDisplayStore((state) => state.setFiltersExpanded);
  const { hasActiveFilters } = useFilterValues();

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("relative", className)}
      onClick={() => setFiltersExpanded(!filtersExpanded)}
      aria-label={filtersExpanded ? "Hide filters" : "Show filters"}
      aria-expanded={filtersExpanded}
    >
      <FunnelIcon className="size-4" />
      {hasActiveFilters && !filtersExpanded && (
        <span className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
      )}
    </Button>
  );
}
