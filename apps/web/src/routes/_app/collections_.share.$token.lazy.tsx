import type { Marketplace, Printing, PublicCollectionDetailResponse } from "@openrift/shared";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { ADD_STRIP_HEIGHT } from "@/components/cards/card-grid-constants";
import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
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
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { usePublicCollection } from "@/hooks/use-collections";
import { useChannelRegistry } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useKeywordReverseMap } from "@/hooks/use-keyword-reverse-map";
import { formatterForMarketplace } from "@/lib/format";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

export const Route = createLazyFileRoute("/_app/collections_/share/$token")({
  component: SharedCollectionPage,
});

// "copies" is a collection-owner concept (one tile per physical copy keyed by
// copyId); a public viewer doesn't own anything, so clamp to "printings".
// "owned" is meaningless without an authed user. The rest mirror what
// CollectionGrid hides on the authenticated page.
const SHARED_HIDDEN_FILTER_SECTIONS: ReadonlySet<string> = new Set([
  "owned",
  "markers",
  "channels",
  "customTags",
]);

function SharedCollectionPage() {
  const { token } = Route.useParams();
  const { data } = usePublicCollection(token);
  const search = Route.useSearch();
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
              <PageTopBarTitle>{collection.name}</PageTopBarTitle>
              <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
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
            </PageTopBar>
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-x-clip px-3 pb-3">
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
  // Pre-hydration the top bar already shows the collection name and owner,
  // which is what crawlers need. The grid relies on the global catalog
  // (useCards) plus client-only display + filter state, so defer the mount.
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
  const { copies } = data;
  const { printingsById, sets } = useCards();
  const display = useCardThumbnailDisplay();
  const showImages = useDisplayStore((state) => state.showImages);
  const channels = useChannelRegistry();
  const keywordReverseMap = useKeywordReverseMap();
  const isMobile = useIsMobile();

  const { filters, sortBy, sortDir, view: rawView, groupBy, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  // "copies" is a collection-owner view; public visitors can't break printings
  // into individual physical copies. Treat it as "printings".
  const view = rawView === "copies" ? "printings" : rawView;

  // Resolve the collection's copies into printings + per-printing count.
  const countByPrintingId: Record<string, number> = {};
  for (const copy of copies) {
    countByPrintingId[copy.printingId] = (countByPrintingId[copy.printingId] ?? 0) + 1;
  }
  const collectionPrintings: Printing[] = [];
  for (const printingId of Object.keys(countByPrintingId)) {
    const printing = printingsById[printingId];
    if (printing) {
      collectionPrintings.push(printing);
    }
  }

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
    sortBy,
    sortDir,
    view,
    groupBy,
    // Public visitor has no owned-count context — owned/missing/incomplete is
    // hidden from the filter panel via SHARED_HIDDEN_FILTER_SECTIONS.
    ownedCountByPrinting: undefined,
    favoriteMarketplace: display.favoriteMarketplace,
    prices: display.prices,
    keywordReverseMap,
    channels,
  });

  const items: CardViewerItem[] = sortedCards.map((printing) => ({ id: printing.id, printing }));

  // When grouping by set in cards view, each (cardId, setId) gets its own tile,
  // so a click has to navigate by printing — otherwise clicking a reprint would
  // jump back to the first tile that shares its cardId. Mirrors CardBrowser.
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
    const siblings = view === "cards" ? printingsByCardId.get(cardId) : undefined;
    return (
      <CardThumbnail
        printing={item.printing}
        onClick={handleCardClick}
        siblings={siblings}
        priceRange={priceRangeByCardId?.get(cardId)}
        view={view}
        showImages={showImages}
        isSelected={ctx.isSelected}
        isFlashing={ctx.isFlashing}
        cardWidth={ctx.cardWidth}
        priority={ctx.priority}
        display={display}
        aboveCard={<OwnedCountStrip count={countByPrintingId[item.printing.id] ?? 0} />}
      />
    );
  };

  const toolbar = (
    <>
      <div className="mb-3 flex items-start gap-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={filteredCount} />
        <DesktopOptionsBar className="hidden sm:flex" />
        <FilterToggleButton className="@wide:hidden hidden sm:flex" />
        <MobileOptionsDrawer
          doneLabel={
            hasActiveFilters
              ? `Show ${filteredCount} ${view === "cards" ? "cards" : "printings"}`
              : undefined
          }
          className="sm:hidden"
        >
          <MobileOptionsContent />
          <MobileFilterContent
            availableFilters={availableFilters}
            availableLanguages={availableLanguages}
            filterCounts={filterCounts}
            setDisplayLabel={setDisplayLabel}
            hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
          />
        </MobileOptionsDrawer>
      </div>
      <CollapsibleFilterPanel
        availableFilters={availableFilters}
        availableLanguages={availableLanguages}
        filterCounts={filterCounts}
        setDisplayLabel={setDisplayLabel}
        hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
      />
    </>
  );

  const leftPane = (
    <Pane className="@wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent
          availableFilters={availableFilters}
          availableLanguages={availableLanguages}
          filterCounts={filterCounts}
          setDisplayLabel={setDisplayLabel}
          hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
        />
      </div>
    </Pane>
  );

  const aboveGrid = (
    <ActiveFilters
      availableFilters={availableFilters}
      setDisplayLabel={setDisplayLabel}
      hiddenSections={SHARED_HIDDEN_FILTER_SECTIONS}
    />
  );

  const rightPane = isMobile ? undefined : (
    <SelectionDetailPane
      items={items}
      printingsByCardId={printingsByCardId}
      showImages={showImages}
      onSearchAndClose={handleSearchAndClose}
    />
  );

  if (collectionPrintings.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This collection is empty.</p>;
  }

  return (
    <CardViewer
      items={items}
      totalItems={collectionPrintings.length}
      renderCard={renderCard}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={aboveGrid}
      rightPane={rightPane}
      addStripHeight={ADD_STRIP_HEIGHT}
      table={{
        showOwned: true,
        showAddControls: false,
        view,
        printingsByCardId,
        actionsLabel: "Copies",
        // renderActions overrides the default ownedCount cell (which is
        // auth-keyed via useOwnedCountFor and would read 0 for the public
        // visitor); we render the per-printing count from the share payload.
        renderActions: (printing) => {
          const count = countByPrintingId[printing.id] ?? 0;
          return count > 0 ? <span>×{count}</span> : null;
        },
      }}
    >
      {isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={handleSearchAndClose}
        />
      )}
    </CardViewer>
  );
}
