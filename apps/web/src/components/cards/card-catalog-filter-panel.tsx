import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { ActiveFilters } from "@/components/filters/active-filters";
import { CollapsibleFilterPanel } from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import { MobileFilterContent } from "@/components/filters/options-bar";
import { Pane } from "@/components/layout/panes";
import { useCatalogFilterMeta } from "@/hooks/use-card-data";
import { useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";

interface FilterMetaContextValue {
  availableFilters: AvailableFilters;
  availableLanguages: string[];
  filterCounts: FilterCounts;
  setDisplayLabel: (slug: string) => string;
  hiddenSections: ReadonlySet<string> | undefined;
}

const FilterMetaContext = createContext<FilterMetaContextValue | null>(null);

function useFilterMeta(): FilterMetaContextValue {
  const value = use(FilterMetaContext);
  if (!value) {
    throw new Error("CardCatalog filter slots must render under <CardCatalogFilterProvider>");
  }
  return value;
}

interface CardCatalogFilterProviderProps {
  hiddenSections?: ReadonlySet<string>;
  children: ReactNode;
}

/**
 * Wraps the catalog browser with a meta context so the filter UI's chips
 * can read availableFilters/filterCounts without each consumer re-running
 * `useCatalogFilterMeta`. When the owned filter is empty, the hook's
 * returned ref stays stable across +/- clicks on the copies collection.
 *
 * @returns The provider tree wrapping `children`.
 */
export function CardCatalogFilterProvider({
  hiddenSections,
  children,
}: CardCatalogFilterProviderProps) {
  const { allPrintings, sets } = useCards();
  const channels = useChannelRegistry();
  const { filters, view: rawView } = useFilterValues();
  const display = useCardThumbnailDisplay();
  const keywordReverseMap = useKeywordReverseMap();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  const { data: ownedCountByPrinting } = useOwnedCount(isLoggedIn);

  // "copies" is a collection-only view; the catalog browser clamps it to
  // "printings" so the filter-meta computation stays valid.
  const view = rawView === "copies" ? "printings" : rawView;

  // Gate ownedCountByPrinting at the call site rather than inside
  // useCatalogFilterMeta. React Compiler tracks the hook's inputs whether or
  // not the runtime branch reads them, so passing the live map even with an
  // empty owned filter was busting downstream memoization on every +/-
  // click. When no buckets are selected, every chip is owned-count-independent,
  // so the hook receives a stable `undefined` and its return ref holds.
  const ownedCountForMeta = filters.ownedFilter.length > 0 ? ownedCountByPrinting : undefined;

  const meta = useCatalogFilterMeta({
    allPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    view,
    ownedCountByPrinting: ownedCountForMeta,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const metaValue: FilterMetaContextValue = {
    availableFilters: meta.availableFilters,
    availableLanguages: meta.availableLanguages,
    filterCounts: meta.filterCounts,
    setDisplayLabel: meta.setDisplayLabel,
    hiddenSections,
  };

  return <FilterMetaContext.Provider value={metaValue}>{children}</FilterMetaContext.Provider>;
}

/**
 * Mobile drawer's filter pane. Subscribes to {@link FilterMetaContext}.
 *
 * @returns The mobile filter content.
 */
export function CardCatalogMobileFilters() {
  const ctx = useFilterMeta();
  return (
    <MobileFilterContent
      availableFilters={ctx.availableFilters}
      availableLanguages={ctx.availableLanguages}
      setDisplayLabel={ctx.setDisplayLabel}
      filterCounts={ctx.filterCounts}
      hiddenSections={ctx.hiddenSections}
    />
  );
}

/**
 * Mid-width collapsible filter row. Subscribes to {@link FilterMetaContext}.
 *
 * @returns The collapsible filter row.
 */
export function CardCatalogCollapsibleFilters() {
  const ctx = useFilterMeta();
  return (
    <CollapsibleFilterPanel
      availableFilters={ctx.availableFilters}
      availableLanguages={ctx.availableLanguages}
      setDisplayLabel={ctx.setDisplayLabel}
      filterCounts={ctx.filterCounts}
      hiddenSections={ctx.hiddenSections}
    />
  );
}

/**
 * Desktop left-pane filter content. Subscribes to {@link FilterMetaContext}.
 *
 * @returns The desktop filter pane.
 */
export function CardCatalogLeftPaneFilters() {
  const ctx = useFilterMeta();
  return (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={ctx.availableFilters}
          availableLanguages={ctx.availableLanguages}
          setDisplayLabel={ctx.setDisplayLabel}
          filterCounts={ctx.filterCounts}
          hiddenSections={ctx.hiddenSections}
        />
      </div>
    </Pane>
  );
}

/**
 * Active-filter chip strip rendered above the grid. Subscribes only to
 * {@link FilterMetaContext}.
 *
 * @returns The active filters strip.
 */
export function CardCatalogActiveFilters() {
  const ctx = useFilterMeta();
  return (
    <ActiveFilters availableFilters={ctx.availableFilters} setDisplayLabel={ctx.setDisplayLabel} />
  );
}
