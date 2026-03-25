import type { Printing } from "@openrift/shared";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useDeferredValue, useRef } from "react";

import { CardBrowserContext } from "@/components/card-browser-context";
import { CardGrid } from "@/components/cards/card-grid";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
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
    ownedCountByPrinting: ownedCountByPrinting ?? undefined,
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
      <div className="space-y-4">
        {adding && addingTo && (
          <AddToCollectionFlow
            ref={addFlowRef}
            collectionId={addingTo}
            printingsByCardId={printingsByCardId}
          />
        )}
        <FilterBar
          availableFilters={availableFilters}
          totalCards={totalUniqueCards}
          filteredCount={sortedCards.length}
          setDisplayLabel={setDisplayLabel}
        />
        <ActiveFilters availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />

        <div className="flex items-start gap-6">
          <FilterSidebar availableFilters={availableFilters} setDisplayLabel={setDisplayLabel} />
          <div
            className={`min-w-0 flex-1 transition-opacity duration-150 ${isGridStale ? "opacity-60" : "opacity-100"}`}
          >
            <CardGrid
              cards={deferredSortedCards}
              totalCards={allPrintings.length}
              setOrder={sets}
              selectedCardId={gridSelectedId}
              keyboardNavCardId={selectedCard?.id}
            />
          </div>
          {selectedCard && detailOpen && (
            <Suspense fallback={<CardDetailSkeleton />}>
              <CardDetail
                printing={selectedCard}
                onClose={handleDetailClose}
                showImages={showImages}
                onPrevCard={handlePrevCard}
                onNextCard={handleNextCard}
                onTagClick={(tag) => {
                  setSearch(`t:${tag}`);
                  if (isMobile) {
                    handleDetailClose();
                  }
                }}
                onKeywordClick={(keyword) => {
                  setSearch(`k:${keyword}`);
                  if (isMobile) {
                    handleDetailClose();
                  }
                }}
                printings={siblingPrintings}
                onSelectPrinting={setSelectedCard}
              />
            </Suspense>
          )}
        </div>
      </div>
    </CardBrowserContext>
  );
}

function CardDetailSkeleton() {
  return (
    <aside className="fixed inset-0 z-50 bg-background md:sticky md:inset-auto md:z-auto md:top-(--sticky-top) md:w-[400px] md:shrink-0 md:max-h-[calc(100vh-var(--sticky-top))] md:rounded-lg md:px-3">
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
    </aside>
  );
}
