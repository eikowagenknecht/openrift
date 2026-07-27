import { imageUrl } from "@openrift/shared";
import { getRouteApi } from "@tanstack/react-router";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { LABEL_HEIGHT } from "@/components/cards/card-grid-constants";
import { ActiveFilters } from "@/components/filters/active-filters";
import { CompactFilterBar } from "@/components/filters/compact-filter-bar";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { useFilterValues } from "@/hooks/use-card-filters";
import { fromWireFacets, fromWireFilterCounts } from "@/lib/cards-facets";
import { DEFAULT_TOP_LEVEL_UNITS } from "@/lib/filter-sections";
import { LANDSCAPE_ROTATION_STYLE } from "@/lib/images";
import { cn } from "@/lib/utils";

const cardsRoute = getRouteApi("/_app/cards");

// SSR can't tell whether the user is signed in, so we hide the Owned chip in
// the shell. The live <CardBrowser> shows it for logged-in users on hydration.
// Markers and channels live with /promos and have no /cards UI; always hide.
const SSR_HIDDEN: ReadonlySet<string> = new Set(["owned", "markers", "channels"]);

// Per-cell visibility classes that pair with the grid's column breakpoints so
// each viewport shows exactly two complete rows. We always render 16 cells
// (two rows at the widest, 8-col breakpoint) and trim the overflow with
// container-query `display:none` at narrower widths. Full class strings are
// required for Tailwind's scanner — don't concatenate dynamically.
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
 * SSR-only preview of the cards page. Rendered inside the route's Suspense
 * fallback so the served HTML carries:
 *  - Real filter chrome (toolbar, compact filter bar, active filters) sized
 *    to its final dimensions, populated from the loader's `facets` payload —
 *    so the swap to the live `<CardBrowser>` on hydration doesn't shift the
 *    layout.
 *  - Real `<img>` tags for the first two rows of cards as the LCP candidate.
 *    The cells span the widest grid breakpoint (16 = 8 cols × 2 rows); narrower
 *    breakpoints hide the overflow via `visibilityForIndex` so each viewport
 *    shows exactly two complete rows.
 *
 * On client-side navigation the loader returns `facets: null` and this
 * component renders nothing — the live grid is already mounting.
 *
 * SSR caveats (cosmetic, not layout shifts):
 *  - `isLoggedIn` is treated as false here; the add-mode button slots into
 *    the toolbar after hydration for signed-in users.
 *  - `useDisplayStore` reads use Zustand defaults until the persist
 *    middleware rehydrates from localStorage; the bar renders the default
 *    filter placement here, so a customized placement snaps in on hydration.
 * @returns The SSR shell, or null when there's no SSR loader payload.
 */
export function FirstRowPreview() {
  const { firstRow, facets, availableLanguages, setLabels, counts, filterCounts } =
    cardsRoute.useLoaderData();
  // Match the live toolbar's grouping: tighten the gap below the search row when
  // the active-filters strip renders below it. Keeps SSR chrome dimensions in
  // step with the hydrated <CardBrowser> so the swap doesn't shift the layout.
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
          {/* Mirrors BrowserActiveFilters: the strip lives in the same sticky
              tier as the search row and only shows below sm, where the compact
              bar gives way to the mobile drawer. */}
          <div className="contents sm:hidden">
            <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
          </div>
        </>
      }
      gridSlot={
        firstRow.length === 0 ? null : (
          <>
            {/* Set-group header — mirrors <HeaderRow> in card-grid.tsx so the
                live grid lands here on hydration without shifting cards down.
                aria-hidden because the live grid renders an interactive button
                with the same text; we just need the SSR HTML to occupy the
                matching height/baseline. */}
            <div className="flex items-center gap-3 pt-4 pb-2" aria-hidden="true">
              <div className="bg-border-accent h-px flex-1" />
              <span className="flex flex-row gap-3 text-sm">
                <span className="text-muted-foreground font-medium">{firstRow[0]?.setSlug}</span>
                <span className="font-semibold">
                  {setLabels[firstRow[0]?.setSlug ?? ""] ?? firstRow[0]?.setSlug}
                </span>
              </span>
              <div className="bg-border-accent h-px flex-1" />
            </div>
            {/* mt-4 mirrors the virtualizer's GAP (16px) between adjacent
                rows — header → first card row. Without it the cards sit
                ~16px too high vs. the hydrated grid.
                Column breakpoints query `@container/grid` (set on the center
                column in <CardBrowserLayout>) and mirror the table in
                useResponsiveColumns. Viewport breakpoints would over-count
                columns whenever the filter sidebar is open. */}
            <div className="mt-4 grid grid-cols-2 gap-4 @min-[640px]/grid:grid-cols-3 @min-[768px]/grid:grid-cols-4 @min-[1024px]/grid:grid-cols-5 @min-[1280px]/grid:grid-cols-6 @min-[1600px]/grid:grid-cols-7 @min-[1920px]/grid:grid-cols-8">
              {firstRow.map((card, i) => {
                const srcSet = `${imageUrl(card.imageId, "120w")} 120w, ${imageUrl(card.imageId, "240w")} 240w, ${imageUrl(card.imageId, "400w")} 400w, ${imageUrl(card.imageId, "full")} 800w`;
                const sizes =
                  "(min-width: 1920px) calc((100vw - 112px) / 8 - 12px), (min-width: 1600px) calc((100vw - 96px) / 7 - 12px), (min-width: 1280px) calc((100vw - 80px) / 6 - 12px), (min-width: 1024px) calc((100vw - 64px) / 5 - 12px), (min-width: 768px) calc((100vw - 48px) / 4 - 12px), (min-width: 640px) calc((100vw - 32px) / 3 - 12px), calc((100vw - 16px) / 2 - 12px)";
                const fetchPriority = i === 0 ? "high" : undefined;
                return (
                  // Mirrors the live <CardRowContent> deferred-cell shape:
                  // p-1.5 wrapper (BUTTON_PAD), card image, then a label-height
                  // spacer matching CardThumbnail's two-line CardMetaLabel block.
                  // Without the wrapper the SSR cells render ~12px wider and
                  // ~LABEL_HEIGHT shorter than the live cells, shifting the
                  // grid down and inward when CardBrowser hydrates.
                  <div
                    key={card.printingId}
                    className={cn("rounded-lg p-1.5", visibilityForIndex(i))}
                  >
                    {card.rotated ? (
                      // Landscape battlefields: mirror CardThumbnail's rotated
                      // branch so the SSR shell shows them in their final
                      // portrait-framed, -90deg-rotated orientation. The
                      // in-flow aspect-card spacer gives the overflow-hidden box
                      // a definite height so the rotated overlay's top: 50%
                      // resolves (Firefox needs this — see card-thumbnail.tsx).
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
          </>
        )
      }
    />
  );
}
