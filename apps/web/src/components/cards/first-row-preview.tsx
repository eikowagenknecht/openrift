import { imageUrl } from "@openrift/shared";
import { getRouteApi } from "@tanstack/react-router";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { ActiveFilters } from "@/components/filters/active-filters";
import { CompactFilterBar } from "@/components/filters/compact-filter-bar";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { OrnamentRule } from "@/components/ui/ornament";
import { useFilterValues } from "@/hooks/use-card-filters";
import { SSR_RESPONSIVE_GRID_COLS, SSR_RESPONSIVE_GRID_GAP } from "@/hooks/use-responsive-columns";
import { LABEL_HEIGHT } from "@/lib/card-grid-constants";
import { fromWireFacets, fromWireFilterCounts } from "@/lib/cards-facets";
import { DEFAULT_TOP_LEVEL_UNITS } from "@/lib/filter-sections";
import { LANDSCAPE_ROTATION_STYLE } from "@/lib/images";
import { cn } from "@/lib/utils";

const cardsRoute = getRouteApi("/_app/cards");

const SSR_HIDDEN: ReadonlySet<string> = new Set(["owned", "markers", "channels"]);

// Full class strings required for Tailwind's scanner: don't concatenate dynamically.
function visibilityForIndex(i: number): string {
  if (i < 4) {
    return "";
  }
  if (i < 6) {
    return "hidden @min-[640px]/grid:block";
  }
  if (i < 8) {
    return "hidden @min-[768px]/grid:block";
  }
  if (i < 10) {
    return "hidden @min-[1024px]/grid:block";
  }
  if (i < 12) {
    return "hidden @min-[1280px]/grid:block";
  }
  if (i < 14) {
    return "hidden @min-[1600px]/grid:block";
  }
  return "hidden @min-[1920px]/grid:block";
}

/**
 * SSR-only preview of the cards page, rendered inside the route's Suspense
 * fallback so it must pixel-match the live `<CardBrowser>` layout to avoid a
 * hydration shift. Treats the viewer as logged out and uses default (not
 * persisted) filter placement, since neither is known at SSR time.
 */
export function FirstRowPreview() {
  const { firstRow, facets, availableLanguages, setLabels, counts, filterCounts } =
    cardsRoute.useLoaderData();
  const { hasActiveFilters } = useFilterValues();
  if (facets === null) {
    return null;
  }

  const availableFilters = fromWireFacets(facets);
  const filterCountsHydrated = filterCounts ? fromWireFilterCounts(filterCounts) : undefined;
  const setDisplayLabel = (slug: string) => setLabels[slug] ?? slug;

  return (
    <CardBrowserLayout
      toolbar={
        <>
          <div className={cn("flex items-start gap-3", hasActiveFilters ? "mb-2" : "mb-3")}>
            <SearchBar totalCards={counts.totalCards} filteredCount={counts.filteredCount} />
            <DesktopOptionsBar className="hidden sm:flex" />
            <MobileOptionsDrawer className="sm:hidden">
              <MobileOptionsContent />
              <MobileFilterContent
                availableFilters={availableFilters}
                availableLanguages={availableLanguages}
                setDisplayLabel={setDisplayLabel}
                hiddenSections={SSR_HIDDEN}
                filterCounts={filterCountsHydrated}
              />
            </MobileOptionsDrawer>
          </div>
          <CompactFilterBar
            availableFilters={availableFilters}
            availableLanguages={availableLanguages}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={SSR_HIDDEN}
            filterCounts={filterCountsHydrated}
            topLevelUnits={DEFAULT_TOP_LEVEL_UNITS}
          />
          <div className="contents sm:hidden">
            <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
          </div>
        </>
      }
      gridSlot={
        firstRow.length === 0 ? null : (
          // Header-to-cards gap must match the virtualizer's row gap for hydration parity.
          <div className={cn("flex flex-col", SSR_RESPONSIVE_GRID_GAP)}>
            <OrnamentRule fade="tips" className="pt-4 pb-2" aria-hidden="true">
              <span className="flex flex-row gap-3 text-sm">
                <span className="text-muted-foreground font-medium">{firstRow[0]?.setSlug}</span>
                <span className="font-semibold">
                  {setLabels[firstRow[0]?.setSlug ?? ""] ?? firstRow[0]?.setSlug}
                </span>
              </span>
            </OrnamentRule>
            <div className={cn("grid", SSR_RESPONSIVE_GRID_COLS, SSR_RESPONSIVE_GRID_GAP)}>
              {firstRow.map((card, i) => {
                const srcSet = `${imageUrl(card.imageId, "120w")} 120w, ${imageUrl(card.imageId, "240w")} 240w, ${imageUrl(card.imageId, "400w")} 400w, ${imageUrl(card.imageId, "full")} 800w`;
                // Approximate resolution hint only; exact per-breakpoint values come from computeGridMetrics.
                const sizes =
                  "(min-width: 1920px) calc((100vw - 126px) / 8 - 6px), (min-width: 1600px) calc((100vw - 102px) / 7 - 6px), (min-width: 1280px) calc((100vw - 75px) / 6 - 6px), (min-width: 1024px) calc((100vw - 56px) / 5 - 6px), (min-width: 768px) calc((100vw - 39px) / 4 - 6px), (min-width: 640px) calc((100vw - 30px) / 3 - 6px), calc((100vw - 10px) / 2 - 6px)";
                const fetchPriority = i === 0 ? "high" : undefined;
                return (
                  // Must mirror <CardRowContent>'s cell shape (wrapper padding, image, label spacer)
                  // or the SSR cells render a different size and hydration shifts the grid.
                  <div
                    key={card.printingId}
                    className={cn("rounded-lg p-0.75", visibilityForIndex(i))}
                  >
                    {card.rotated ? (
                      // aspect-card spacer gives the box a definite height so the rotated
                      // overlay's top: 50% resolves in Firefox (see card-thumbnail.tsx).
                      <div className="relative w-full overflow-hidden rounded-lg">
                        <div className="aspect-card" />
                        <div
                          className="absolute top-1/2 left-1/2 overflow-hidden"
                          style={LANDSCAPE_ROTATION_STYLE}
                        >
                          <img
                            src={imageUrl(card.imageId, "400w")}
                            srcSet={srcSet}
                            sizes={sizes}
                            width={880}
                            height={630}
                            alt={card.cardName}
                            fetchPriority={fetchPriority}
                            className="size-full object-cover"
                          />
                        </div>
                      </div>
                    ) : (
                      <img
                        src={imageUrl(card.imageId, "400w")}
                        srcSet={srcSet}
                        sizes={sizes}
                        width={400}
                        height={558}
                        alt={card.cardName}
                        fetchPriority={fetchPriority}
                        className="aspect-card w-full rounded-lg object-cover"
                      />
                    )}
                    <div aria-hidden="true" style={{ height: LABEL_HEIGHT }} />
                  </div>
                );
              })}
            </div>
          </div>
        )
      }
    />
  );
}
