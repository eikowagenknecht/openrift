import type { FilterPanelContentProps } from "@/components/filters/FilterBar";
import { FilterPanelContent } from "@/components/filters/FilterBar";

type FilterSidebarProps = FilterPanelContentProps;

export function FilterSidebar(props: FilterSidebarProps) {
  return (
    <aside className="hidden wide:block sticky top-(--sticky-top) w-[400px] shrink-0 max-h-[calc(100vh-var(--sticky-top))] overflow-y-auto rounded-lg px-3">
      <div className="pt-4 pb-4">
        <h2 className="text-lg font-semibold">Filters</h2>
      </div>

      <div className="space-y-4 pb-4">
        <FilterPanelContent {...props} />
      </div>
    </aside>
  );
}
