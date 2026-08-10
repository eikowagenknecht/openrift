import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import { ActiveFilters } from "@/components/filters/active-filters";
import { CompactFilterBar } from "@/components/filters/compact-filter-bar";
import {
  DesktopOptionsBar,
  DetailPaneToggle,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { useFilterValues, useStaleGroupByGuard } from "@/hooks/use-card-filters";
import { resolveTopLevelUnits } from "@/lib/filter-sections";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface CardBrowserFilterMeta {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  filterCounts?: FilterCounts;
  setDisplayLabel?: (slug: string) => string;
  /** The surface's own contextual hides — what this surface never shows here. */
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

interface CardBrowserFilterContextValue extends CardBrowserFilterMeta {
  /**
   * The user's top-level placement units (see `lib/filter-sections.ts`),
   * resolved once here so both filter surfaces (compact bar, mobile drawer)
   * partition identically.
   */
  topLevelUnits: ReadonlySet<string>;
}

const FilterMetaContext = createContext<CardBrowserFilterContextValue | null>(null);

function useFilterMeta(): CardBrowserFilterContextValue {
  const value = use(FilterMetaContext);
  if (!value) {
    throw new Error("Card browser filter slots must render under <CardBrowserFilterProvider>");
  }
  return value;
}

/**
 * Non-throwing variant for components that may render outside a card-browser
 * surface (e.g. the customize control, which self-disables when there's no
 * filter context).
 * @returns The filter meta, or null when not under a provider.
 */
export function useFilterMetaOptional(): CardBrowserFilterContextValue | null {
  return use(FilterMetaContext);
}

interface CardBrowserFilterProviderProps extends CardBrowserFilterMeta {
  children: ReactNode;
}

/**
 * Wraps a card-browser surface (catalog, collection, deck builder, shared
 * collection, promos) with a meta context so `BrowserToolbar`,
 * `BrowserMobileFilters`, and `BrowserActiveFilters` can read
 * availableFilters/filterCounts/etc. without each surface threading them
 * through the toolbar / aboveGrid JSX.
 *
 * Each surface is responsible for computing its own meta — typically from
 * `useCardData` or `useCollectionCardData` (or `useCatalogFilterMeta` in the
 * catalog, which adds an owned-count gating optimization).
 *
 * @returns The provider tree wrapping `children`.
 */
export function CardBrowserFilterProvider({ children, ...meta }: CardBrowserFilterProviderProps) {
  // Mounted once per surface — the natural home for the stale-URL correction
  // that drops a printings-only grouping left over in a cards-view URL.
  useStaleGroupByGuard();
  const topLevelFilters = useDisplayStore((state) => state.topLevelFilters);
  const topLevelUnits = resolveTopLevelUnits(topLevelFilters);
  return <FilterMetaContext value={{ ...meta, topLevelUnits }}>{children}</FilterMetaContext>;
}

/**
 * The compact filter bar — the standard filter surface from `sm` up (below
 * that the mobile drawer takes over). Reads meta from
 * {@link CardBrowserFilterProvider}.
 * @returns The compact filter bar.
 */
function BrowserCompactFilters() {
  const meta = useFilterMeta();
  return (
    <CompactFilterBar
      availableFilters={meta.availableFilters}
      availableLanguages={meta.availableLanguages}
      filterCounts={meta.filterCounts}
      setDisplayLabel={meta.setDisplayLabel}
      hiddenSections={meta.hiddenSections}
      visibleCustomTagCategories={meta.visibleCustomTagCategories}
      ownedCountMax={meta.ownedCountMax}
      topLevelUnits={meta.topLevelUnits}
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
      topLevelUnits={meta.topLevelUnits}
    />
  );
}

/**
 * Active-filter chip strip. Rendered inside {@link BrowserToolbar}'s sticky
 * tier (right below the search row) so search + chips pin as one block on
 * mobile. Reads meta from {@link CardBrowserFilterProvider}.
 *
 * @returns The active filters strip.
 */
export function BrowserActiveFilters() {
  const meta = useFilterMeta();
  // The compact filter bar already surfaces every active filter inline — each
  // dropdown shows its selection (count or single-value summary, including
  // orphaned values you can still untick), so the chip strip is redundant
  // wherever that bar is visible. Hide it exactly there, mirroring the bar's
  // own `hidden sm:flex` visibility: a layout-neutral `display: contents`
  // wrapper that collapses to `display: none` from sm up. Below sm the bar
  // gives way to the mobile drawer, so the strip stays the only filter readout
  // on the grid there.
  return (
    <div className="contents sm:hidden">
      <ActiveFilters
        availableFilters={meta.availableFilters}
        setDisplayLabel={meta.setDisplayLabel}
        hiddenSections={meta.hiddenSections}
        ownedCountMax={meta.ownedCountMax}
      />
    </div>
  );
}

interface BrowserToolbarProps {
  totalCards: number;
  filteredCount: number;
  /** Override for the mobile drawer's "Done" button when filters are active. */
  mobileDoneLabel?: string;
  /** Extra buttons placed after DesktopOptionsBar (e.g. catalog-mode toggle). */
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
 * controls, optional extras slot, and the mobile options drawer. The compact
 * filter bar sits underneath. Every card-browser surface uses this — surfaces
 * with a different group-by axis (e.g. /promos) pass `groupByOptions` to
 * override the list.
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
  // On mobile the active-filters strip renders right below the search row, in
  // this same sticky tier (see BrowserActiveFilters below). Tighten the gap so
  // the search row and its chips read as one grouped block instead of two
  // evenly-spaced bands. That strip is sm:hidden, so from sm up (where the
  // compact filter bar replaces it) the gap stays a constant mb-3 to avoid a
  // state-dependent shift with nothing below to group with.
  const { hasActiveFilters } = useFilterValues();
  return (
    <>
      <div className={cn("flex items-start gap-3", hasActiveFilters ? "mb-2 sm:mb-3" : "mb-3")}>
        <SearchBar totalCards={totalCards} filteredCount={filteredCount} />
        <DesktopOptionsBar
          className="hidden sm:flex"
          showCopies={showCopies}
          hideViewToggle={hideViewToggle}
          groupByOptions={groupByOptions}
          groupByValue={groupByValue}
        />
        {extras}
        {/* Last, so the pane toggle is the rightmost control on every surface —
            surface extras vary, the dock button's position must not. */}
        <DetailPaneToggle />
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
      <BrowserCompactFilters />
      {/* Mobile-only chip strip, kept in this sticky tier so search + chips pin
          as one block. On sm+ it collapses to display:none (the compact bar
          above surfaces the same filters inline). */}
      <BrowserActiveFilters />
    </>
  );
}
