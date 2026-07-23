import type { Marketplace, Printing, PublicCollectionDetailResponse } from "@openrift/shared";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import {
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "@/components/cards/card-browser-filter-scaffold";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { StaticCountTableActions } from "@/components/cards/static-count-table-actions";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { TopBarBreadcrumbSeparator } from "@/components/layout/top-bar-breadcrumb";
import { OnLoanChip } from "@/components/loans/on-loan-chip";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-session";
import { filterPrintingsByLanguages } from "@/lib/filter-printings-by-languages";
import { formatterForMarketplace } from "@/lib/format";
import { maxOwnedCount } from "@/lib/owned-bucket";
import type { FilterSearch } from "@/lib/search-schemas";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

function SharedCollectionCountCell({
  printing,
  countByPrintingId,
}: {
  printing?: Printing;
  itemId?: string;
  countByPrintingId: Record<string, number>;
}) {
  if (!printing) {
    return null;
  }
  return <StaticCountTableActions count={countByPrintingId[printing.id] ?? 0} />;
}

// "copies" is a collection-owner concept (one tile per physical copy keyed by
// copyId); a viewer with read-only access doesn't own anything, so clamp to
// "printings".
//
// "owned" is meaningless without an authed inventory, so it's hidden for
// logged-out viewers. Logged-in viewers DO get it: the Owned/Copies filters
// are scoped to the viewer's own personal collections (not this collection's
// counts), so they can answer "which cards here do I have less than a playset
// of?". See the `ownedCountByPrinting` wiring in SharedCollectionGrid.
// Markers and channels stay visible (a shared collection can hold promo
// printings); both sections self-hide when no printing here carries one.
const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set(["owned", "customTags"]);
const SHARED_HIDDEN_FILTER_SECTIONS_AUTHED: ReadonlySet<string> = new Set(["customTags"]);

interface SharedCollectionViewProps {
  data: PublicCollectionDetailResponse;
  search: FilterSearch;
  topBarTrailing?: ReactNode;
}

/**
 * Read-only collection browser. Used by both the anonymous
 * `/collections/share/$token` route and the authenticated group-scoped
 * `/groups/$slug/collections/$id` route. Pass `topBarTrailing` to render a
 * back button or breadcrumb in the page header.
 *
 * @returns The shared collection page node.
 */
export function SharedCollectionView({ data, search, topBarTrailing }: SharedCollectionViewProps) {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  const marketplaceOrder = useDisplayStore((state) => state.marketplaceOrder);
  const marketplace = (marketplaceOrder[0] ?? "cardtrader") as Marketplace;
  const formatValue = formatterForMarketplace(marketplace);

  const { collection, owner } = data;
  const valueLabel =
    collection.totalValueCents === null ? null : formatValue(collection.totalValueCents / 100);

  return (
    <FilterSearchProvider value={search}>
      <PageTopBarHeightContext value={topBarHeight}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY}>
            <PageTopBar>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
                {topBarTrailing}
                {topBarTrailing ? <TopBarBreadcrumbSeparator className="hidden sm:inline" /> : null}
                <PageTopBarTitle>{collection.name}</PageTopBarTitle>
                <span className="text-muted-foreground hidden shrink-0 items-baseline gap-x-1.5 text-xs sm:flex">
                  <span>Shared by {owner.displayName}</span>
                  {valueLabel !== null && (
                    <span>
                      · {valueLabel}
                      {collection.unpricedCopyCount ? (
                        <span className="text-muted-foreground/60 ml-1">
                          ({collection.unpricedCopyCount} unpriced)
                        </span>
                      ) : null}
                    </span>
                  )}
                </span>
              </div>
            </PageTopBar>
          </div>
          <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
            {collection.description ? (
              <p className="text-muted-foreground py-3 text-sm">{collection.description}</p>
            ) : null}
            <SharedCollectionBody data={data} />
          </div>
        </div>
      </PageTopBarHeightContext>
    </FilterSearchProvider>
  );
}

function SharedCollectionBody({ data }: { data: PublicCollectionDetailResponse }) {
  const hydrated = useHydrated();
  // Pre-hydration the top bar already shows the collection name and owner.
  // The grid relies on the global catalog (useCards) plus client-only
  // display + filter state, so defer the mount.
  if (!hydrated) {
    return null;
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground py-3 text-sm">Loading cards…</p>}>
      <SharedCollectionGrid data={data} />
    </Suspense>
  );
}

function SharedCollectionGrid({ data }: { data: PublicCollectionDetailResponse }) {
  const { items: copies } = data;
  const { printingsById, sets, printingsByCardId: catalogAllPrintingsByCardId } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);
  // The viewer's own owned counts, scoped to their personal collections only
  // (useOwnedCount excludes group-collection copies). This drives the
  // Owned/Copies filters below — "owned" here means "in my collections", not
  // "in this shared collection".
  const { data: viewerOwnedByPrinting } = useOwnedCount(isLoggedIn);

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const view = rawView === "copies" ? "printings" : rawView;

  const countByPrintingId: Record<string, number> = {};
  // Copies out on a loan (ADR-039). The friend-group projection carries the
  // flag (badge-only, no borrower identity); the anonymous public share
  // deliberately doesn't, so this map stays empty there and no badges render.
  const onLoanByPrintingId: Record<string, number> = {};
  for (const copy of copies as { printingId: string; onLoan?: boolean }[]) {
    countByPrintingId[copy.printingId] = (countByPrintingId[copy.printingId] ?? 0) + 1;
    if (copy.onLoan) {
      onLoanByPrintingId[copy.printingId] = (onLoanByPrintingId[copy.printingId] ?? 0) + 1;
    }
  }
  const collectionPrintings: Printing[] = [];
  for (const printingId of Object.keys(countByPrintingId)) {
    const printing = printingsById[printingId];
    if (printing) {
      collectionPrintings.push(printing);
    }
  }

  // Mirror the catalog's gating: only feed the owned map into useCardData when
  // an owned/copies filter is actually active, so the returned ref stays stable
  // and the grid doesn't churn as the viewer's inventory updates elsewhere.
  const ownedFilterActive =
    filters.ownedFilter.length > 0 ||
    filters.ownedCountMin !== null ||
    filters.ownedCountMax !== null;
  const ownedCountForCardData = ownedFilterActive ? viewerOwnedByPrinting : undefined;

  const {
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    availableFilters,
    availableLanguages,
    filterCounts,
    setDisplayLabel,
    totalUniqueCards,
    filteredCount,
  } = useCardData({
    allPrintings: collectionPrintings,
    sets,
    filters,
    ownedFilter: filters.ownedFilter,
    ownedCountMin: filters.ownedCountMin,
    ownedCountMax: filters.ownedCountMax,
    sortBy,
    sortDir,
    view,
    groupBy,
    ownedCountByPrinting: ownedCountForCardData,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  // The detail-pane picker lists every printing of the clicked card from the
  // global catalog, not just the ones present in this shared collection. Scope
  // only by the active language filter.
  const detailPanePrintingsByCardId = filterPrintingsByLanguages(
    catalogAllPrintingsByCardId,
    filters.languages,
  );

  // Upper bound for the "Copies" slider — the most copies the viewer personally
  // owns of any one card that appears in this collection. Computed from the
  // always-on owned map (not the gated one above), so the chrome bound is
  // stable; feeds only the filter panel.
  const ownedCountBound = maxOwnedCount(
    collectionPrintings,
    viewerOwnedByPrinting ?? {},
    view === "printings" ? "printing" : "card",
  );
  const hiddenSections = isLoggedIn
    ? SHARED_HIDDEN_FILTER_SECTIONS_AUTHED
    : SHARED_HIDDEN_FILTER_SECTIONS;

  const items: CardViewerItem[] = sortedCards.map((printing) => ({ id: printing.id, printing }));
  const findBy: "card" | "printing" = view === "cards" && groupBy !== "set" ? "card" : "printing";

  const handleCardClick = (printing: Printing) => {
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const handleSearchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => {
    const cardId = item.printing.cardId;
    const onLoan = onLoanByPrintingId[item.printing.id] ?? 0;
    return (
      <CardCell
        printing={item.printing}
        ctx={ctx}
        display={display}
        showImages={showImages}
        view={view}
        onClick={handleCardClick}
        siblings={view === "cards" ? printingsByCardId.get(cardId) : undefined}
        priceRange={priceRangeByCardId?.get(cardId)}
        strip={
          <CardCountStrip
            count={countByPrintingId[item.printing.id] ?? 0}
            extras={onLoan > 0 ? <OnLoanChip count={onLoan} /> : undefined}
          />
        }
      />
    );
  };

  const toolbar = (
    <BrowserToolbar
      totalCards={totalUniqueCards}
      filteredCount={filteredCount}
      mobileDoneLabel={
        hasActiveFilters
          ? `Show ${filteredCount} ${view === "cards" ? "cards" : "printings"}`
          : undefined
      }
    />
  );
  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={detailPanePrintingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (collectionPrintings.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This collection is empty.</p>;
  }

  return (
    <CardBrowserFilterProvider
      availableFilters={availableFilters}
      availableLanguages={availableLanguages}
      filterCounts={filterCounts}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={hiddenSections}
      ownedCountMax={ownedCountBound}
    >
      <CardViewer
        items={items}
        totalItems={collectionPrintings.length}
        renderCard={renderCard}
        toolbar={toolbar}
        rightPane={rightPane}
        addStripHeight={ADD_STRIP_HEIGHT}
        table={{
          actionsColumn: "narrow",
          actionsLabel: "Copies",
          actionsCell: <SharedCollectionCountCell countByPrintingId={countByPrintingId} />,
        }}
      >
        {isMobile && (
          <SelectionMobileOverlay
            items={items}
            printingsByCardId={detailPanePrintingsByCardId}
            showImages={showImages}
            onSearchAndClose={handleSearchAndClose}
          />
        )}
      </CardViewer>
    </CardBrowserFilterProvider>
  );
}
