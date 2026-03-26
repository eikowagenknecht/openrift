import type { AvailableFilters } from "@openrift/shared";

import { cn } from "@/lib/utils";

import { FilterPanelContent } from "./filter-panel-content";

/* ------------------------------------------------------------------ */
/*  DesktopTopFilter — inline filters, visible sm to wide              */
/* ------------------------------------------------------------------ */

export function DesktopTopFilter({
  availableFilters,
  setDisplayLabel,
  className,
}: {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
  className?: string;
}) {
  return (
    <div className={cn("flex-wrap gap-4", className)}>
      <FilterPanelContent availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DesktopSidebarFilter — sidebar filters, visible at wide            */
/* ------------------------------------------------------------------ */

export function DesktopSidebarFilter({
  availableFilters,
  setDisplayLabel,
}: {
  availableFilters: AvailableFilters;
  setDisplayLabel?: (code: string) => string;
}) {
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
