import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import type { ReactNode } from "react";
import { createContext, use } from "react";

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

export interface CardBrowserFilterMeta {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  filterCounts?: FilterCounts;
  setDisplayLabel?: (slug: string) => string;
  hiddenSections?: ReadonlySet<string>;
  visibleCustomTagCategories?: ReadonlySet<string>;
  /**
   * Upper bound for the "Copies" owned-count slider — the most copies the user
   * owns of any one card on this surface. Each surface computes this from its
   * own owned-count source (global copies on the catalog, deck-available copies
   * in the builder, per-collection copies on a collection). Omit/0 hides it.
   */
  ownedCountMax?: number;
}

const FilterMetaContext = createContext<CardBrowserFilterMeta | null>(null);

function useFilterMeta(): CardBrowserFilterMeta {
  const value = use(FilterMetaContext);
  if (!value) {
    throw new Error("Card browser filter slots must render under <CardBrowserFilterProvider>");
  }
  return value;
}

interface CardBrowserFilterProviderProps extends CardBrowserFilterMeta {
  children: ReactNode;
}

/**
 * Wraps a card-browser surface (catalog, collection, deck builder, shared
 * collection, promos) with a meta context so `BrowserLeftPane`,
 * `BrowserCollapsibleFilters`, `BrowserMobileFilters`, and
 * `BrowserActiveFilters` can read availableFilters/filterCounts/etc. without
 * each surface threading them through the toolbar / leftPane / aboveGrid JSX.
 *
 * Each surface is responsible for computing its own meta — typically from
 * `useCardData` or `useCollectionCardData` (or `useCatalogFilterMeta` in the
 * catalog, which adds an owned-count gating optimization).
 *
 * @returns The provider tree wrapping `children`.
 */
export function CardBrowserFilterProvider({ children, ...meta }: CardBrowserFilterProviderProps) {
  return <FilterMetaContext value={meta}>{children}</FilterMetaContext>;
}

/**
 * Desktop left-pane filter content. Reads meta from {@link CardBrowserFilterProvider}.
 *
 * @returns The desktop filter pane.
 */
export function BrowserLeftPane() {
  const meta = useFilterMeta();
  return (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={meta.availableFilters}
          availableLanguages={meta.availableLanguages}
          filterCounts={meta.filterCounts}
          setDisplayLabel={meta.setDisplayLabel}
          hiddenSections={meta.hiddenSections}
          visibleCustomTagCategories={meta.visibleCustomTagCategories}
          ownedCountMax={meta.ownedCountMax}
        />
      </div>
    </Pane>
  );
}

/**
 * Mid-width collapsible filter row. Reads meta from {@link CardBrowserFilterProvider}.
 *
 * @returns The collapsible filter row.
 */
function BrowserCollapsibleFilters() {
  const meta = useFilterMeta();
  return (
    <CollapsibleFilterPanel
      availableFilters={meta.availableFilters}
      availableLanguages={meta.availableLanguages}
      filterCounts={meta.filterCounts}
      setDisplayLabel={meta.setDisplayLabel}
      hiddenSections={meta.hiddenSections}
      visibleCustomTagCategories={meta.visibleCustomTagCategories}
      ownedCountMax={meta.ownedCountMax}
    />
  );
}

/**
 * Mobile drawer's filter pane. Reads meta from {@link CardBrowserFilterProvider}.
 *
 * @returns The mobile filter content.
 */
function BrowserMobileFilters() {
  const meta = useFilterMeta();
  return (
    <MobileFilterContent
      availableFilters={meta.availableFilters}
      availableLanguages={meta.availableLanguages}
      filterCounts={meta.filterCounts}
      setDisplayLabel={meta.setDisplayLabel}
      hiddenSections={meta.hiddenSections}
      visibleCustomTagCategories={meta.visibleCustomTagCategories}
      ownedCountMax={meta.ownedCountMax}
    />
  );
}

/**
 * Active-filter chip strip rendered above the grid. Reads meta from
 * {@link CardBrowserFilterProvider}.
 *
 * @returns The active filters strip.
 */
export function BrowserActiveFilters() {
  const meta = useFilterMeta();
  return (
    <ActiveFilters
      availableFilters={meta.availableFilters}
      setDisplayLabel={meta.setDisplayLabel}
      hiddenSections={meta.hiddenSections}
      ownedCountMax={meta.ownedCountMax}
    />
  );
}

interface BrowserToolbarProps {
  totalCards: number;
  filteredCount: number;
  /** Override for the mobile drawer's "Done" button when filters are active. */
  mobileDoneLabel?: string;
  /** Extra buttons placed between DesktopOptionsBar and FilterToggleButton (e.g. catalog-mode toggle). */
  extras?: ReactNode;
  /** Passed to DesktopOptionsBar + MobileOptionsContent to enable the "copies" view button. */
  showCopies?: boolean;
  /** Hide the cards/printings/copies view toggle (deck builder, promos). */
  hideViewToggle?: boolean;
  /**
   * Override the default group-by options list. /promos uses a custom set
   * (channel / card / year / marker) instead of the catalog default.
   * `value` is widened to `string` because surface-specific keys (e.g. "card")
   * aren't in the shared `GroupByField` enum.
   */
  groupByOptions?: { value: string; label: string }[];
  /**
   * Override the displayed group-by value. Required for surfaces where the
   * URL's groupBy (or its default) can be invalid for the surface's options
   * — e.g. /promos receives "set" by default, which isn't a promo grouping;
   * the surface passes its normalized value here so the dropdown shows a
   * real option instead of the raw URL string.
   */
  groupByValue?: string;
}

/**
 * Standard card-browser toolbar: search bar, sort/group/view/display/columns
 * controls, optional extras slot, filter-panel toggle, and the mobile options
 * drawer. The collapsible filter row sits underneath. Every card-browser
 * surface uses this — surfaces with a different group-by axis (e.g. /promos)
 * pass `groupByOptions` to override the list.
 *
 * @returns The assembled toolbar block.
 */
export function BrowserToolbar({
  totalCards,
  filteredCount,
  mobileDoneLabel,
  extras,
  showCopies,
  hideViewToggle,
  groupByOptions,
  groupByValue,
}: BrowserToolbarProps) {
  return (
    <>
      <div className="mb-1.5 flex items-start gap-3 sm:mb-3">
        <SearchBar totalCards={totalCards} filteredCount={filteredCount} />
        <DesktopOptionsBar
          className="hidden sm:flex"
          showCopies={showCopies}
          hideViewToggle={hideViewToggle}
          groupByOptions={groupByOptions}
          groupByValue={groupByValue}
        />
        {extras}
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <MobileOptionsDrawer doneLabel={mobileDoneLabel} className="sm:hidden">
          <MobileOptionsContent
            showCopies={showCopies}
            hideViewToggle={hideViewToggle}
            groupByOptions={groupByOptions}
            groupByValue={groupByValue}
          />
          <BrowserMobileFilters />
        </MobileOptionsDrawer>
      </div>
      <BrowserCollapsibleFilters />
    </>
  );
}
