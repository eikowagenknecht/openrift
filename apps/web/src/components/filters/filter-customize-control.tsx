import { SlidersHorizontalIcon } from "lucide-react";

import { useFilterMetaOptional } from "@/components/cards/card-browser-filter-scaffold";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCustomTagList } from "@/hooks/use-enums";
import { getApplicablePlacementUnits, keepPlacementUnits } from "@/lib/filter-sections";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Inline "Customize filters" control for the filter chrome. Lets the user pick
 * where each filter unit lives — at the top level (an inline chip / panel
 * section) or in the "More" group (the compact bar's More menu, the panel's
 * collapsed More-filters fold) — stored as a global per-user preference
 * (synced for signed-in users, device-local otherwise). Reads the surface's
 * own hides from context so it only offers units this surface actually
 * supports — moving one is never a no-op.
 *
 * Renders nothing outside a card-browser surface (no filter-meta context) or
 * when the surface has no placeable units to offer.
 * @returns The customize button + popover, or null when not applicable.
 */
export function FilterCustomizeControl({
  className,
  revealOnHover,
}: {
  className?: string;
  /**
   * Fade the trigger in only while the surrounding filter zone is hovered or the
   * trigger is focused, so the control doesn't clutter the panel at rest. The
   * parent must carry the `group` class. The changed-placement indicator dot
   * fades with it — a small loss of its visibility in exchange for a cleaner
   * panel.
   */
  revealOnHover?: boolean;
}) {
  const meta = useFilterMetaOptional();
  const topLevelFilters = useDisplayStore((state) => state.topLevelFilters);
  const setTopLevelFilters = useDisplayStore((state) => state.setTopLevelFilters);
  const placementOverridden = useDisplayStore((state) => state.overrides.topLevelFilters !== null);
  const resetPreference = useDisplayStore((state) => state.resetPreference);
  const { byCategory } = useCustomTagList();

  if (!meta) {
    return null;
  }

  const customTagCategoryCount = meta.visibleCustomTagCategories
    ? [...byCategory.keys()].filter((category) => meta.visibleCustomTagCategories?.has(category))
        .length
    : byCategory.size;

  const applicable = getApplicablePlacementUnits({
    availableFilters: meta.availableFilters,
    availableLanguages: meta.availableLanguages,
    surfaceHiddenSections: meta.hiddenSections,
    customTagCategoryCount,
  });

  if (applicable.length === 0) {
    return null;
  }

  const topLevel = new Set(keepPlacementUnits(topLevelFilters));

  const setPlacement = (key: string, top: boolean) => {
    const next = new Set(keepPlacementUnits(topLevelFilters));
    if (top) {
      next.add(key);
    } else {
      next.delete(key);
    }
    setTopLevelFilters([...next]);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        className={cn(
          "text-muted-foreground relative",
          // Reveal on hover/focus only. The indicator dot reveals with it — fine
          // to trade a bit of its visibility for a less cluttered panel at rest.
          revealOnHover &&
            "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          className,
        )}
        aria-label={
          placementOverridden ? "Customize filters — placement changed" : "Customize filters"
        }
      >
        <SlidersHorizontalIcon className="size-4" />
        {placementOverridden && (
          // Changed-placement dot, kept inside the button bounds so it isn't
          // clipped when the panel is an overflow-hidden / scrolling container.
          <span className="bg-primary ring-background absolute top-0.5 right-0.5 size-2 rounded-full ring-2" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Filter placement</PopoverTitle>
        </PopoverHeader>
        <p className="text-muted-foreground pb-1 text-xs">
          Top-level filters stay in view. Everything else moves into “More”.
        </p>
        <div className="flex flex-col">
          {applicable.map((unit) => {
            const isTop = topLevel.has(unit.key);
            return (
              <div key={unit.key} className="flex items-center justify-between gap-2 px-1 py-1">
                <span className="min-w-0 flex-1 truncate">{unit.label}</span>
                {/* Two-button segment instead of a checkbox: placement is a
                    choice between two homes, not an on/off. */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant={isTop ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-6 px-2", !isTop && "text-muted-foreground")}
                    aria-pressed={isTop}
                    onClick={() => setPlacement(unit.key, true)}
                  >
                    Top
                  </Button>
                  <Button
                    variant={isTop ? "ghost" : "secondary"}
                    size="sm"
                    className={cn("h-6 px-2", isTop && "text-muted-foreground")}
                    aria-pressed={!isTop}
                    onClick={() => setPlacement(unit.key, false)}
                  >
                    More
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {placementOverridden && (
          <div className="flex items-center justify-end border-t pt-2">
            <Button variant="ghost" size="sm" onClick={() => resetPreference("topLevelFilters")}>
              Reset to default
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
