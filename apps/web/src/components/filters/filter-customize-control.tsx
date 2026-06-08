import { SlidersHorizontalIcon } from "lucide-react";

import { useFilterMetaOptional } from "@/components/cards/card-browser-filter-scaffold";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCustomTagList } from "@/hooks/use-enums";
import { getApplicableToggleableSections } from "@/lib/filter-sections";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Inline "Customize filters" control for the bottom of the filter panel. Lets
 * the user pick which optional filter sections appear, stored as a global
 * per-user preference (synced for signed-in users, device-local otherwise).
 * Reads the surface's own (un-merged) hides from context so it only offers
 * sections that this surface actually supports — toggling is never a no-op.
 *
 * Renders nothing outside a card-browser surface (no filter-meta context) or
 * when the surface has no toggleable sections to offer.
 * @returns The customize button + popover, or null when not applicable.
 */
export function FilterCustomizeControl({ className }: { className?: string }) {
  const meta = useFilterMetaOptional();
  const hiddenFilterSections = useDisplayStore((state) => state.hiddenFilterSections);
  const setHiddenFilterSections = useDisplayStore((state) => state.setHiddenFilterSections);
  const { byCategory } = useCustomTagList();

  if (!meta) {
    return null;
  }

  const customTagCategoryCount = meta.visibleCustomTagCategories
    ? [...byCategory.keys()].filter((category) => meta.visibleCustomTagCategories?.has(category))
        .length
    : byCategory.size;

  const applicable = getApplicableToggleableSections({
    availableFilters: meta.availableFilters,
    availableLanguages: meta.availableLanguages,
    surfaceHiddenSections: meta.hiddenSections,
    customTagCategoryCount,
  });

  if (applicable.length === 0) {
    return null;
  }

  const hidden = new Set(hiddenFilterSections);
  const hiddenHere = applicable.filter((section) => hidden.has(section.key));

  const setVisible = (key: string, visible: boolean) => {
    const next = new Set(hiddenFilterSections);
    if (visible) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setHiddenFilterSections([...next]);
  };

  // Show/Hide all only touch the sections offered here, leaving choices made on
  // other surfaces (e.g. a hidden section that isn't applicable here) untouched.
  const showAll = () => {
    const applicableKeys = new Set(applicable.map((section) => section.key));
    setHiddenFilterSections(hiddenFilterSections.filter((key) => !applicableKeys.has(key)));
  };

  const hideAll = () => {
    const applicableKeys = applicable.map((section) => section.key);
    setHiddenFilterSections([...new Set([...hiddenFilterSections, ...applicableKeys])]);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        className={cn("text-muted-foreground relative", className)}
        aria-label={
          hiddenHere.length > 0
            ? `Customize filters — ${hiddenHere.length} hidden`
            : "Customize filters"
        }
      >
        <SlidersHorizontalIcon className="size-4" />
        {hiddenHere.length > 0 && (
          // Active-filter dot, kept inside the button bounds so it isn't
          // clipped when the panel is an overflow-hidden / scrolling container.
          <span className="bg-primary ring-background absolute top-0.5 right-0.5 size-2 rounded-full ring-2" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle>Show filters</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-col">
          {applicable.map((section) => {
            const id = `filter-visibility-${section.key}`;
            const visible = !hidden.has(section.key);
            return (
              <div key={section.key} className="flex items-center gap-2 px-1 py-1.5">
                <Checkbox
                  id={id}
                  checked={visible}
                  onCheckedChange={(checked: boolean) => setVisible(section.key, checked)}
                />
                <label htmlFor={id} className="flex-1 cursor-pointer">
                  {section.label}
                </label>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={hiddenHere.length === applicable.length}
            onClick={hideAll}
          >
            Hide all
          </Button>
          <Button variant="ghost" size="sm" disabled={hiddenHere.length === 0} onClick={showAll}>
            Show all
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
