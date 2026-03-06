import type { FilterPanelContentProps } from "@/components/filters/filter-bar";
import { FilterPanelContent } from "@/components/filters/filter-bar";

type FilterSidebarProps = FilterPanelContentProps;

export function FilterSidebar(props: FilterSidebarProps) {
  const f = props.availableFilters;
  const hasContent =
    f.sets.length > 0 || f.domains.length > 0 || f.types.length > 0 || f.rarities.length > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <aside className="hidden wide:block sticky top-(--sticky-top) w-[400px] shrink-0 max-h-[calc(100vh-var(--sticky-top))] overflow-y-auto rounded-lg px-3">
      <div className="pt-4 pb-4">
        <h2 className="text-lg font-semibold">Filters</h2>
      </div>

      <div className="space-y-4 pb-4">
        <FilterPanelContent {...props} layout="drawer" />
      </div>
    </aside>
  );
}
