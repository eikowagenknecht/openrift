import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import type { ReactNode } from "react";
import { createContext, use } from "react";

import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { ActiveFilters } from "@/components/filters/active-filters";
import { CollapsibleFilterPanel } from "@/components/filters/collapsible-filter-panel";
import { FilterPanelContent, FlagBadge } from "@/components/filters/filter-panel-content";
import { MobileFilterContent } from "@/components/filters/options-bar";
import { Pane } from "@/components/layout/panes";
import { useCatalogFilterMeta, useOwnedFlagCount } from "@/hooks/use-card-data";
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

// Two contexts on purpose: meta is reference-stable across +/- clicks when
// ownedFilter is null, so its consumers (set/domain/type/range chip subtrees)
// skip re-renders entirely. The owned-chip count gets its own context so only
// <CardCatalogOwnedFlagBadge> re-runs when copies change.
const FilterMetaContext = createContext<FilterMetaContextValue | null>(null);
const OwnedFlagCountContext = createContext<number | undefined>(undefined);

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
 * Wraps the catalog browser with split contexts so the filter UI's
 * non-owned chips bail on +/- clicks while the owned-chip count still
 * tracks changes. The provider itself re-renders on ownedCount changes
 * (it subscribes via {@link useOwnedFlagCount}), but it only shuffles
 * context values — no real DOM work — and consumers split into a stable
 * meta tree and an owned-chip tree.
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
  // not the runtime branch reads them, so passing the live map even when
  // ownedFilter is null was busting downstream memoization on every +/-
  // click. When ownedFilter is null, every chip is owned-count-independent,
  // so the hook receives a stable `undefined` and its return ref holds.
  const ownedCountForMeta = filters.ownedFilter ? ownedCountByPrinting : undefined;

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
  const ownedFlagCount = useOwnedFlagCount({
    allPrintings,
    filters,
    view,
    ownedFilter: filters.ownedFilter,
    ownedCountByPrinting,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    enabled: isLoggedIn,
  });

  const metaValue: FilterMetaContextValue = {
    availableFilters: meta.availableFilters,
    availableLanguages: meta.availableLanguages,
    filterCounts: meta.filterCounts,
    setDisplayLabel: meta.setDisplayLabel,
    hiddenSections,
  };

  return (
    <FilterMetaContext.Provider value={metaValue}>
      <OwnedFlagCountContext.Provider value={ownedFlagCount}>
        {children}
      </OwnedFlagCountContext.Provider>
    </FilterMetaContext.Provider>
  );
}

/**
 * Self-subscribing Owned chip — reads count from {@link OwnedFlagCountContext}
 * and label/active/onClick from URL filter state. Sits as a leaf under the
 * provider so a +/- click invalidates only this chip, not the rest of the
 * filter panel.
 *
 * @returns The Owned filter badge.
 */
function CardCatalogOwnedFlagBadge({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const count = use(OwnedFlagCountContext);
  return <FlagBadge label={label} isActive={isActive} count={count} onClick={onClick} />;
}

const renderOwnedFlag = (props: { label: string; isActive: boolean; onClick: () => void }) => (
  <CardCatalogOwnedFlagBadge {...props} />
);

/**
 * Mobile drawer's filter pane. Subscribes to {@link FilterMetaContext} only,
 * so it doesn't re-render on +/- clicks; the Owned chip slot is filled by
 * {@link CardCatalogOwnedFlagBadge}.
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
      renderOwnedFlag={renderOwnedFlag}
    />
  );
}

/**
 * Mid-width collapsible filter row. Subscribes to {@link FilterMetaContext}
 * only.
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
      renderOwnedFlag={renderOwnedFlag}
    />
  );
}

/**
 * Desktop left-pane filter content. Subscribes to {@link FilterMetaContext}
 * only.
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
          renderOwnedFlag={renderOwnedFlag}
        />
      </div>
    </Pane>
  );
}

/**
 * Active-filter chip strip rendered above the grid. Subscribes only to
 * {@link FilterMetaContext}, since it doesn't show owned counts.
 *
 * @returns The active filters strip.
 */
export function CardCatalogActiveFilters() {
  const ctx = useFilterMeta();
  return (
    <ActiveFilters availableFilters={ctx.availableFilters} setDisplayLabel={ctx.setDisplayLabel} />
  );
}
