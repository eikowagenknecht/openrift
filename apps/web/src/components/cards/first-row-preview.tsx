import { getRouteApi } from "@tanstack/react-router";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  CollapsibleFilterPanel,
  FilterToggleButton,
} from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { Pane } from "@/components/layout/panes";
import { fromWireFacets } from "@/lib/cards-facets";

const cardsRoute = getRouteApi("/_app/cards");

/**
 * SSR-only preview of the cards page. Rendered inside the route's Suspense
 * fallback so the served HTML carries:
 *  - Real filter chrome (toolbar, left pane, active filters) sized to its
 *    final dimensions, populated from the loader's `facets` payload — so the
 *    swap to the live `<CardBrowser>` on hydration doesn't shift the layout.
 *  - Real `<img>` tags for the first row of cards as the LCP candidate.
 *
 * On client-side navigation the loader returns `facets: null` and this
 * component renders nothing — the live grid is already mounting.
 *
 * SSR caveats (cosmetic, not layout shifts):
 *  - `isLoggedIn` is treated as false here; the add-mode button slots into
 *    the toolbar after hydration for signed-in users.
 *  - `useDisplayStore` reads (e.g. `filtersExpanded`) use Zustand defaults
 *    until the persist middleware rehydrates from localStorage.
 * @returns The SSR shell, or null when there's no SSR loader payload.
 */
export function FirstRowPreview() {
  const { firstRow, facets, availableLanguages, setLabels, counts } = cardsRoute.useLoaderData();
  if (facets === null) {
    return null;
  }

  const availableFilters = fromWireFacets(facets);
  const setDisplayLabel = (slug: string) => setLabels[slug] ?? slug;

  return (
    <CardBrowserLayout
      toolbar={
        <>
          <div className="mb-1.5 flex items-start gap-3 sm:mb-3">
            <SearchBar totalCards={counts.totalCards} filteredCount={counts.filteredCount} />
            <DesktopOptionsBar className="hidden sm:flex" />
            <FilterToggleButton className="@wide:hidden hidden sm:flex" />
            <MobileOptionsDrawer className="sm:hidden">
              <MobileOptionsContent />
              <MobileFilterContent
                availableFilters={availableFilters}
                availableLanguages={availableLanguages}
                setDisplayLabel={setDisplayLabel}
              />
            </MobileOptionsDrawer>
          </div>
          <CollapsibleFilterPanel
            availableFilters={availableFilters}
            availableLanguages={availableLanguages}
            setDisplayLabel={setDisplayLabel}
          />
        </>
      }
      leftPane={
        <Pane className="@wide:block px-3">
          <h2 className="pb-4 text-lg font-semibold">Filters</h2>
          <div className="space-y-4 pb-4">
            <FilterPanelContent
              availableFilters={availableFilters}
              availableLanguages={availableLanguages}
              setDisplayLabel={setDisplayLabel}
            />
          </div>
        </Pane>
      }
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      gridSlot={
        firstRow.length === 0 ? null : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {firstRow.map((card, i) => (
              <img
                key={card.printingId}
                src={card.thumbnail}
                srcSet={`${card.thumbnail} 400w, ${card.full} 800w`}
                sizes="(min-width: 1536px) 14vw, (min-width: 1280px) 17vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                width={400}
                height={558}
                alt={card.cardName}
                fetchPriority={i === 0 ? "high" : undefined}
                className="aspect-card w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )
      }
    />
  );
}
