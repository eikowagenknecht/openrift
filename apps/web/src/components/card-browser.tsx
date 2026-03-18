import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useDeferredValue, useRef } from "react";

import { CardGrid } from "@/components/cards/card-grid";
import type { AddToCollectionFlowHandle } from "@/components/collection/add-to-collection-flow";
import { AddToCollectionFlow } from "@/components/collection/add-to-collection-flow";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardData } from "@/hooks/use-card-data";
import { useCardDetailNav } from "@/hooks/use-card-detail-nav";
import { useCardFilters } from "@/hooks/use-card-filters";
import { ApiError, useCards } from "@/hooks/use-cards";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useSession } from "@/lib/auth-client";
import { useDisplayStore } from "@/stores/display-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

export function CardBrowser() {
  const showImages = useDisplayStore((s) => s.showImages);
  const { allCards, setInfoList, isLoading, error } = useCards();
  const { data: session } = useSession();
  const { data: ownedCountByPrinting } = useOwnedCount(Boolean(session?.user));

  // Adding mode state
  const [adding] = useQueryState("adding", parseAsBoolean.withDefault(false));
  const [addingTo] = useQueryState("addingTo", parseAsString.withDefault(""));
  const addFlowRef = useRef<AddToCollectionFlowHandle>(null);

  const { filters, sortBy, sortDir, view, setSearch } = useCardFilters();

  const {
    availableFilters,
    sortedCards,
    printingsByCardId,
    priceRangeByCardId,
    ownedCounts,
    totalUniqueCards,
    setDisplayLabel,
  } = useCardData({
    allCards,
    setInfoList,
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

  if (error) {
    const healthStatus = error instanceof ApiError ? error.healthStatus : null;
    let title = "Failed to load cards.";
    let hint: string | null = null;

    if (healthStatus === "db_unreachable") {
      title = "The database isn't running.";
      hint = "docker compose up db -d";
    } else if (healthStatus === "db_not_migrated") {
      title = "The database hasn't been set up yet.";
      hint = "bun db:migrate && bun db:seed";
    } else if (healthStatus === "db_empty") {
      title = "The database is empty.";
      hint = "bun db:seed";
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32">
        <p className="text-muted-foreground">{title}</p>
        {hint && (
          <code className="bg-muted text-muted-foreground rounded px-3 py-1.5 text-sm">{hint}</code>
        )}
        <button
          type="button"
          className="text-sm underline"
          onClick={() => globalThis.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100svh-3.5rem)] space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex items-start gap-6">
          <Skeleton className="hidden wide:block h-[60svh] w-[400px] shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
              {Array.from({ length: 20 }, (_, i) => (
                <Skeleton key={i} className="aspect-[744/1039] rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)] space-y-4">
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
            totalCards={allCards.length}
            setOrder={setInfoList}
            onCardClick={handleCardClick}
            onSiblingClick={handleCardClick}
            selectedCardId={gridSelectedId}
            priceRangeByCardId={priceRangeByCardId}
            view={view}
            siblingPrintings={siblingPrintings}
            printingsByCardId={printingsByCardId}
            ownedCounts={ownedCounts}
            onAddCard={
              adding && addingTo ? (p, el) => addFlowRef.current?.handleAddClick(p, el) : undefined
            }
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
                if (globalThis.matchMedia("(max-width: 767px)").matches) {
                  handleDetailClose();
                }
              }}
              onKeywordClick={(keyword) => {
                setSearch(`k:${keyword}`);
                if (globalThis.matchMedia("(max-width: 767px)").matches) {
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
        <Skeleton className="aspect-[744/1039] w-full rounded-xl" />
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
