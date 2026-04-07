import type { AvailableFilters } from "@openrift/shared";
import { SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useFilterValues } from "@/hooks/use-card-filters";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

import { FilterBadgeSections, FilterRangeSections } from "./filter-panel-content";

interface CollapsibleFilterPanelProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  hiddenSections?: ReadonlySet<string>;
}

/**
 * Inline filter panel for mid-width screens (sm but not @wide).
 * Controlled by the `filtersExpanded` display store flag;
 * pair with `<FilterToggleButton>` in the toolbar row.
 * @returns The collapsible filter content, or null when collapsed.
 */
export function CollapsibleFilterPanel({
  availableFilters,
  setDisplayLabel,
  hiddenSections,
}: CollapsibleFilterPanelProps) {
  const filtersExpanded = useDisplayStore((state) => state.filtersExpanded);
  const setFiltersExpanded = useDisplayStore((state) => state.setFiltersExpanded);

  return (
    <Collapsible
      open={filtersExpanded}
      onOpenChange={setFiltersExpanded}
      className="@wide:hidden hidden sm:block"
    >
      <CollapsibleContent className="h-(--collapsible-panel-height) space-y-3 overflow-hidden pt-2 pb-2 transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 lg:grid-cols-2">
          <FilterBadgeSections
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={hiddenSections}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <FilterRangeSections availableFilters={availableFilters} />
        </div>
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
      <SlidersHorizontalIcon className="size-4" />
      {hasActiveFilters && !filtersExpanded && (
        <span className="bg-primary absolute -top-1 -right-1 size-2 rounded-full" />
      )}
    </Button>
  );
}
