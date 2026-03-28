import type { Printing } from "@openrift/shared";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useDeferredValue, useRef } from "react";

import { CardViewer } from "@/components/card-viewer";
import type { CardRenderContext, CardViewerItem } from "@/components/card-viewer-types";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useCardData } from "@/hooks/use-card-data";
import { useCardDetailNav } from "@/hooks/use-card-detail-nav";
import { useFilterActions, useFilterValues } from "@/hooks/use-card-filters";
import { useCards } from "@/hooks/use-cards";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { useDisplayStore } from "@/stores/display-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

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

  const {
    selectedCard,
    setSelectedCard,
    detailOpen,
    handleCardClick,
    handleDetailClose,
    handlePrevCard,
    handleNextCard,
  } = useCardDetailNav(items, view === "cards" ? "card" : "printing");

  const searchAndClose = (query: string) => {
    setSearch(query);
    if (isMobile) {
      handleDetailClose();
    }
  };

  const siblingPrintings = selectedCard ? (printingsByCardId.get(selectedCard.card.id) ?? []) : [];

  const gridSelectedId =
    view === "cards" && selectedCard
      ? (deferredSortedCards.find((c) => c.card.id === selectedCard.card.id)?.id ?? selectedCard.id)
      : selectedCard?.id;

  const onAddCard: ((p: Printing, el: HTMLElement) => void) | undefined =
    adding && addingTo ? (p, el) => addFlowRef.current?.handleAddClick(p, el) : undefined;

  const renderCard = (item: CardViewerItem, ctx: CardRenderContext) => (
    <CardThumbnail
      printing={item.printing}
      onClick={handleCardClick}
      onSiblingClick={handleCardClick}
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

  const rightPane =
    selectedCard && detailOpen && !isMobile ? (
      <Pane className="md:block">
        <Suspense fallback={<CardDetailSkeleton />}>
          <CardDetail
            printing={selectedCard}
            onClose={handleDetailClose}
            showImages={showImages}
            onPrevCard={handlePrevCard}
            onNextCard={handleNextCard}
            onTagClick={(tag) => searchAndClose(`t:${tag}`)}
            onKeywordClick={(keyword) => searchAndClose(`k:${keyword}`)}
            printings={siblingPrintings}
            onSelectPrinting={setSelectedCard}
          />
        </Suspense>
      </Pane>
    ) : undefined;

  return (
    <CardViewer
      items={items}
      totalItems={allPrintings.length}
      renderCard={renderCard}
      setOrder={sets}
      selectedItemId={gridSelectedId}
      keyboardNavItemId={selectedCard?.id}
      onItemClick={handleCardClick}
      siblingPrintings={siblingPrintings}
      stale={isGridStale}
      toolbar={toolbar}
      leftPane={leftPane}
      aboveGrid={
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
      }
      rightPane={rightPane}
    >
      {/* Mobile: fullscreen detail overlay */}
      {selectedCard && detailOpen && isMobile && (
        <MobileDetailOverlay>
          <Suspense fallback={<CardDetailSkeleton />}>
            <CardDetail
              printing={selectedCard}
              onClose={handleDetailClose}
              showImages={showImages}
              onPrevCard={handlePrevCard}
              onNextCard={handleNextCard}
              onTagClick={(tag) => searchAndClose(`t:${tag}`)}
              onKeywordClick={(keyword) => searchAndClose(`k:${keyword}`)}
              printings={siblingPrintings}
              onSelectPrinting={setSelectedCard}
            />
          </Suspense>
        </MobileDetailOverlay>
      )}
    </CardViewer>
  );
}

function CardDetailSkeleton() {
  return (
    <div className="bg-background rounded-lg px-3">
      <div className="hidden md:flex md:items-start md:justify-between md:gap-2 md:pt-4 md:pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        <Skeleton className="aspect-card w-full rounded-xl" />
        <div className="flex justify-center gap-1.5">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}
