import type { Printing } from "@openrift/shared";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useDeferredValue, useRef, useState } from "react";

import { BrowserCardViewer } from "@/components/browser-card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
import type { AddedEntry } from "@/components/collection/added-cards-list";
import { AddedCardsList } from "@/components/collection/added-cards-list";
import { ActiveFilters } from "@/components/filters/active-filters";
import {
  FilterBadgeSections,
  FilterPanelContent,
  FilterRangeSections,
} from "@/components/filters/filter-panel-content";
import {
  DesktopOptionsBar,
  MobileFilterContent,
  MobileOptionsContent,
  MobileOptionsDrawer,
} from "@/components/filters/options-bar";
import { SearchBar } from "@/components/filters/search-bar";
import { MobileDetailOverlay } from "@/components/layout/mobile-detail-overlay";
import { Pane } from "@/components/layout/panes";
import { SelectionDetailPane } from "@/components/selection-detail-pane";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useCardData } from "@/hooks/use-card-data";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

export function CardBrowser() {
  useHideScrollbar();
  const isMobile = useIsMobile();
  const showImages = useDisplayStore((s) => s.showImages);
  const visibleFields = useDisplayStore((s) => s.visibleFields);
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Adding mode state
  const [adding] = useQueryState("adding", parseAsBoolean.withDefault(false));
  const [addingTo] = useQueryState("addingTo", parseAsString.withDefault(""));
  const addFlowRef = useRef<AddToCollectionFlowHandle>(null);
  const [addedItems, setAddedItems] = useState<Map<string, AddedEntry>>(new Map());
  const [showAddedList, setShowAddedList] = useState(false);

  const { filters, sortBy, sortDir, view, hasActiveFilters } = useFilterValues();
  const { setSearch } = useFilterActions();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allPrintings,
    sets,
    filters,
    sortBy,
    sortDir,
    view,
    ownedCountByPrinting,
    favoriteMarketplace: marketplaceOrder[0] ?? "tcgplayer",
  });

  // Defer the expensive card grid re-render so the filter UI (badge highlight,
  // sheet close animation) responds immediately. The grid updates once React
  // has spare time after the urgent interactions are painted.
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  // Map Printing[] → CardViewerItem[]
  const items: CardViewerItem[] = deferredSortedCards.map((printing) => ({
    id: printing.id,
    printing,
  }));

  const findBy = view === "cards" ? "card" : ("printing" as const);

  const handleGridCardClick = (printing: Printing) => {
    setShowAddedList(false);
    useSelectionStore.getState().selectCard(printing, items, findBy);
  };

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      useSelectionStore.getState().closeDetail();
    }
  };

  const handleAdded = (printing: Printing, quantity: number) => {
    setAddedItems((prev) => {
      const next = new Map(prev);
      next.delete(printing.id);
      const existing = prev.get(printing.id);
      next.set(printing.id, {
        printing,
        quantity: (existing?.quantity ?? 0) + quantity,
      });
      return next;
    });
  };

  const onAddCard: ((p: Printing, el: HTMLElement) => void) | undefined =
    adding && addingTo ? (p, el) => addFlowRef.current?.handleAddClick(p, el) : undefined;

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <CardThumbnail
      printing={item.printing}
      onClick={handleGridCardClick}
      onSiblingClick={handleGridCardClick}
      showImages={showImages}
      isSelected={ctx.isSelected}
      isFlashing={ctx.isFlashing}
      siblings={printingsByCardId.get(item.printing.card.id)}
      priceRange={priceRangeByCardId?.get(item.printing.card.id)}
      view={view}
      visibleFields={visibleFields}
      cardWidth={ctx.cardWidth}
      priority={ctx.priority}
      ownedCount={ownedCounts?.get(item.printing.id)}
      onAdd={onAddCard}
    />
  );

  const toolbar = (
    <>
      {/* Collection add bar */}
      {adding && addingTo && (
        <AddToCollectionFlow
          ref={addFlowRef}
          collectionId={addingTo}
          printingsByCardId={printingsByCardId}
          addedItems={addedItems}
          onAdded={handleAdded}
          showingAddedList={showAddedList}
          onToggleAddedList={() => setShowAddedList((prev) => !prev)}
        />
      )}
      {/* Search bar */}
      <div className="mb-3 flex items-start gap-3">
        <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
        <DesktopOptionsBar className="hidden sm:flex" />
        <MobileOptionsDrawer
          doneLabel={
            hasActiveFilters
              ? `Show ${sortedCards.length} ${view === "cards" ? "cards" : "printings"}`
              : undefined
          }
          className="sm:hidden"
        >
          <MobileOptionsContent />
          <MobileFilterContent
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </MobileOptionsDrawer>
      </div>
      {/* Filter panel */}
      <div className="wide:hidden hidden space-y-3 sm:block">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <FilterBadgeSections
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </div>
        <div className="grid grid-cols-4 gap-x-6 gap-y-3">
          <FilterRangeSections availableFilters={availableFilters} />
        </div>
      </div>
    </>
  );

  const leftPane = (
    <Pane className="wide:block px-3">
      <h2 className="pb-4 text-lg font-semibold">Filters</h2>
      <div className="space-y-4 pb-4">
        <FilterPanelContent availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      </div>
    </Pane>
  );

  const rightPane = (() => {
    if (isMobile) {
      return;
    }

    if (showAddedList && addedItems.size > 0) {
      return (
        <Pane className="md:block">
          <AddedCardsList
            items={addedItems}
            onCardClick={handleGridCardClick}
            onClose={() => setShowAddedList(false)}
          />
        </Pane>
      );
    }

    return (
      <SelectionDetailPane
        items={items}
        printingsByCardId={printingsByCardId}
        showImages={showImages}
        onSearchAndClose={searchAndClose}
      />
    );
  })();

  return (
    <BrowserCardViewer
      items={items}
      totalItems={allPrintings.length}
      renderCard={renderCard}
      setOrder={sets}
      deferredSortedCards={deferredSortedCards}
      printingsByCardId={printingsByCardId}
      view={view}
      onItemClick={handleGridCardClick}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      rightPane={rightPane}
    >
      {/* Mobile: fullscreen overlays */}
      {showAddedList && addedItems.size > 0 && isMobile && (
        <MobileDetailOverlay>
          <AddedCardsList
            items={addedItems}
            onCardClick={handleGridCardClick}
            onClose={() => setShowAddedList(false)}
          />
        </MobileDetailOverlay>
      )}
      {!showAddedList && isMobile && (
        <SelectionMobileOverlay
          items={items}
          printingsByCardId={printingsByCardId}
          showImages={showImages}
          onSearchAndClose={searchAndClose}
        />
      )}
    </BrowserCardViewer>
  );
}
