import type { Printing } from "@openrift/shared";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useDeferredValue, useRef } from "react";

import { CardBrowserContext } from "@/components/card-browser-context";
import { CardGrid } from "@/components/cards/card-grid";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterPanelContent } from "@/components/filters/filter-panel-content";
import { DesktopOptionsBar, MobileOptionsDrawer } from "@/components/filters/options-bar";
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
import { cn } from "@/lib/utils";
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
  const { allPrintings, sets } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Adding mode state
  const [adding] = useQueryState("adding", parseAsBoolean.withDefault(false));
  const [addingTo] = useQueryState("addingTo", parseAsString.withDefault(""));
  const addFlowRef = useRef<AddToCollectionFlowHandle>(null);

  const { filters, sortBy, sortDir, view } = useFilterValues();
  const { setSearch } = useFilterActions();

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
  });

  // Defer the expensive card grid re-render so the filter UI (badge highlight,
  // sheet close animation) responds immediately. The grid updates once React
  // has spare time after the urgent interactions are painted.
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  const {
    selectedCard,
    setSelectedCard,
    detailOpen,
    handleCardClick,
    handleDetailClose,
    handlePrevCard,
    handleNextCard,
  } = useCardDetailNav(sortedCards, view);

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

  const browserContext = {
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    view,
    onCardClick: handleCardClick,
    onSiblingClick: handleCardClick,
    onAddCard,
    siblingPrintings,
  };

  return (
    <CardBrowserContext value={browserContext}>
      <div>
        {/* Collection add bar */}
        {adding && addingTo && (
          <AddToCollectionFlow
            ref={addFlowRef}
            collectionId={addingTo}
            printingsByCardId={printingsByCardId}
          />
        )}
        {/* Search bar */}
        <div className="flex items-start gap-3 mb-3">
          <SearchBar totalCards={totalUniqueCards} filteredCount={sortedCards.length} />
          <DesktopOptionsBar className="hidden sm:flex" />
          <MobileOptionsDrawer filteredCount={sortedCards.length} className="sm:hidden">
            <div className="border-t pt-4">
              <p className="mb-2.5 text-sm font-medium">Filters</p>
              <div className="flex flex-col gap-4">
                <FilterPanelContent
                  availableFilters={availableFilters}
                  setDisplayLabel={setDisplayLabel}
                  layout="drawer"
                />
              </div>
            </div>
          </MobileOptionsDrawer>
        </div>
        {/* Filter panel */}
        <div className="hidden sm:flex wide:hidden flex-wrap gap-4">
          <FilterPanelContent
            availableFilters={availableFilters}
            setDisplayLabel={setDisplayLabel}
          />
        </div>
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
        {/* Main area */}
        <div className="flex items-start gap-6 mt-4">
          {/* Main area: Left panel */}
          <Pane className="wide:block">
            <div className="overflow-y-auto rounded-lg px-3">
              <div className="pt-4 pb-4">
                <h2 className="text-lg font-semibold">Filters</h2>
              </div>
              <div className="space-y-4 pb-4">
                <FilterPanelContent
                  availableFilters={availableFilters}
                  setDisplayLabel={setDisplayLabel}
                  layout="drawer"
                />
              </div>
            </div>
          </Pane>
          {/* Main area: Center */}
          <div
            className={cn(
              "min-w-0 flex-1 transition-opacity duration-150",
              isGridStale ? "opacity-60" : "opacity-100",
            )}
          >
            <CardGrid
              cards={deferredSortedCards}
              totalCards={allPrintings.length}
              setOrder={sets}
              selectedCardId={gridSelectedId}
              keyboardNavCardId={selectedCard?.id}
            />
          </div>
          {/* Main area: Right panel */}
          {selectedCard && detailOpen && !isMobile && (
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
          )}
        </div>

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
      </div>
    </CardBrowserContext>
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
