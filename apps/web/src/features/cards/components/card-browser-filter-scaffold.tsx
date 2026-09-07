import type { AvailableFilters } from "@openrift/shared/filters-available";
import type { FilterCounts } from "@openrift/shared/filters-counts";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import { ActiveFilters } from "@/features/cards/components/active-filters";
import { CompactFilterBar } from "@/features/cards/components/compact-filter-bar";
import {
  DesktopOptionsBar,
  DetailPaneToggle,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/features/cards/components/options-bar";
import { SearchBar } from "@/features/cards/components/search-bar";
import { useFilterValues, useStaleGroupByGuard } from "@/features/cards/hooks/use-card-filters";
import { resolveTopLevelUnits } from "@/features/cards/lib/filter-sections";
import { useSmUp } from "@/hooks/use-sm-up";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

interface CardBrowserFilterMeta {
  availableFilters: AvailableFilters;
  availableLanguages?: string[];
  filterCounts?: FilterCounts;
  setDisplayLabel?: (slug: string) => string;
  hiddenSections?: ReadonlySet<string>;
  visibleCustomTagCategories?: ReadonlySet<string>;
  ownedCountMax?: number;
}

interface CardBrowserFilterContextValue extends CardBrowserFilterMeta {
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

/** Non-throwing variant for components that may render outside a card-browser surface. */
export function useFilterMetaOptional(): CardBrowserFilterContextValue | null {
  return use(FilterMetaContext);
}

interface CardBrowserFilterProviderProps extends CardBrowserFilterMeta {
  children: ReactNode;
}

/** Wraps a card-browser surface with a meta context so `BrowserToolbar`,
 * `BrowserMobileFilters`, and `BrowserActiveFilters` can read filter meta
 * without each surface threading it through the toolbar / aboveGrid JSX. */
export function CardBrowserFilterProvider({ children, ...meta }: CardBrowserFilterProviderProps) {
  useStaleGroupByGuard();
  const topLevelFilters = useDisplayStore((state) => state.topLevelFilters);
  const topLevelUnits = resolveTopLevelUnits(topLevelFilters);
  return <FilterMetaContext value={{ ...meta, topLevelUnits }}>{children}</FilterMetaContext>;
}

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

export function BrowserActiveFilters() {
  const meta = useFilterMeta();
  // Mirrors the compact filter bar's `hidden sm:flex`: the bar already
  // surfaces every filter inline from sm up, so the chip strip is redundant there.
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
  mobileDoneLabel?: string;
  extras?: ReactNode;
  showCopies?: boolean;
  hideViewToggle?: boolean;
  hideDisplayModeToggle?: boolean;
  groupByOptions?: { value: string; label: string }[];
  groupByValue?: string;
}

/** Standard card-browser toolbar: search bar, sort/group/view/display/columns
 * controls, optional extras slot, and the mobile options drawer. */
export function BrowserToolbar({
  totalCards,
  filteredCount,
  mobileDoneLabel,
  extras,
  showCopies,
  hideViewToggle,
  hideDisplayModeToggle,
  groupByOptions,
  groupByValue,
}: BrowserToolbarProps) {
  const { hasActiveFilters } = useFilterValues();
  // CSS-hiding alone still re-renders every chip on each filter change: unmount desktop chrome below `sm`, don't just hide it.
  const smUp = useSmUp();
  return (
    <>
      <div className={cn("flex items-start gap-3", hasActiveFilters ? "mb-2 sm:mb-3" : "mb-3")}>
        <SearchBar totalCards={totalCards} filteredCount={filteredCount} />
        {smUp && (
          <DesktopOptionsBar
            className="hidden sm:flex"
            showCopies={showCopies}
            hideViewToggle={hideViewToggle}
            hideDisplayModeToggle={hideDisplayModeToggle}
            groupByOptions={groupByOptions}
            groupByValue={groupByValue}
          />
        )}
        {extras}
        <DetailPaneToggle />
        <MobileOptionsDrawer doneLabel={mobileDoneLabel} className="sm:hidden">
          <MobileOptionsContent
            showCopies={showCopies}
            hideViewToggle={hideViewToggle}
            hideDisplayModeToggle={hideDisplayModeToggle}
            groupByOptions={groupByOptions}
            groupByValue={groupByValue}
          />
          <BrowserMobileFilters />
        </MobileOptionsDrawer>
      </div>
      {smUp && <BrowserCompactFilters />}
      <BrowserActiveFilters />
    </>
  );
}
