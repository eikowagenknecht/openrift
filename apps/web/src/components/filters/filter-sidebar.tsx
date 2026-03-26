import type { AvailableFilters } from "@openrift/shared";

import { FilterPanelContent } from "@/components/filters/filter-panel-content";

interface DesktopSidebarFilterProps {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
}

export function DesktopSidebarFilter({
  availableFilters,
  setDisplayLabel,
}: DesktopSidebarFilterProps) {
  const f = availableFilters;
  const hasContent =
    f.sets.length > 0 || f.domains.length > 0 || f.types.length > 0 || f.rarities.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <div className="overflow-y-auto rounded-lg px-3">
      <div className="pt-4 pb-4">
        <h2 className="text-lg font-semibold">Filters</h2>
      </div>

      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          setDisplayLabel={setDisplayLabel}
          layout="drawer"
        />
      </div>
    </div>
  );
}
