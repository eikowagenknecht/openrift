import type { Card } from "@openrift/shared";
import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared";
import { Suspense, lazy, useDeferredValue, useEffect, useState } from "react";

import { CardGrid } from "@/components/cards/card-grid";
import { ActiveFilters } from "@/components/filters/active-filters";
import { FilterBar } from "@/components/filters/filter-bar";
import { FilterSidebar } from "@/components/filters/filter-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCardFilters } from "@/hooks/use-card-filters";
import { ApiError, useCards } from "@/hooks/use-cards";
import { useDisplayStore } from "@/stores/display-store";

const cardDetailImport = import("@/components/cards/card-detail");
const CardDetail = lazy(async () => {
  const m = await cardDetailImport;
  return { default: m.CardDetail };
});

export function CardBrowser() {
  const showImages = useDisplayStore((s) => s.showImages);
  const cardFields = useDisplayStore((s) => s.cardFields);
  const maxColumns = useDisplayStore((s) => s.maxColumns);
  const setMaxColumns = useDisplayStore((s) => s.setMaxColumns);
  const { allCards, setInfoList, isLoading, error } = useCards();

  const {
    filters,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    toggleSigned,
    togglePromo,
    clearSigned,
    clearPromo,
    setEnergyRange,
    setMightRange,
    setPowerRange,
    setPriceRange,
    setSortBy,
    setSortDir,
    view,
    setView,
    filterState,
    searchScope,
    toggleSearchField,
  } = useCardFilters();

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [physicalMaxColumns, setPhysicalMaxColumns] = useState(8);
  const [physicalMinColumns, setPhysicalMinColumns] = useState(1);
  const [autoColumns, setAutoColumns] = useState(5);

  // Lock body scroll when mobile overlay is active
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen]);

  const setCodeToName = new Map(setInfoList.map((s) => [s.code, s.name]));
  const setDisplayLabel = (code: string) => setCodeToName.get(code) ?? code;

  const availableFilters = getAvailableFilters(allCards);
  const filteredCards = filterCards(allCards, filters);

  // In "cards" mode, deduplicate by cardId — keep the printing with the lowest sourceId.
  const displayCards =
    view === "cards"
      ? (() => {
          const seen = new Map<string, Card>();
          for (const card of filteredCards) {
            const existing = seen.get(card.cardId);
            if (!existing || card.sourceId.localeCompare(existing.sourceId) < 0) {
              seen.set(card.cardId, card);
            }
          }
          return [...seen.values()];
        })()
      : filteredCards;

  const sorted = sortCards(displayCards, sortBy);
  const sortedCards = sortDir === "desc" ? sorted.toReversed() : sorted;

  // Defer the expensive card grid re-render so the filter UI (badge highlight,
  // sheet close animation) responds immediately. The grid updates once React
  // has spare time after the urgent interactions are painted.
  const deferredSortedCards = useDeferredValue(sortedCards);
  const isGridStale = deferredSortedCards !== sortedCards;

  // Close card detail when the user presses the browser back button on mobile
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = globalThis.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }

    history.pushState({ cardDetail: true }, "");

    globalThis.addEventListener("popstate", closeDetail);
    return () => globalThis.removeEventListener("popstate", closeDetail);
  }, [detailOpen]);

  const closeDetail = () => {
    setSelectedCard(null);
    setDetailOpen(false);
  };

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
    setDetailOpen(true);
  };

  const printingsByCardId = (() => {
    const map = new Map<string, Card[]>();
    for (const c of allCards) {
      let group = map.get(c.cardId);
      if (!group) {
        group = [];
        map.set(c.cardId, group);
      }
      group.push(c);
    }
    for (const group of map.values()) {
      group.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    }
    return map;
  })();

  const siblingPrintings = selectedCard ? (printingsByCardId.get(selectedCard.cardId) ?? []) : [];

  const priceRangeByCardId =
    view === "cards"
      ? (() => {
          const map = new Map<string, { min: number; max: number }>();
          for (const [cardId, printings] of printingsByCardId) {
            let min = Infinity;
            let max = -Infinity;
            for (const p of printings) {
              const price = p.price?.market;
              if (price !== null && price !== undefined) {
                min = Math.min(min, price);
                max = Math.max(max, price);
              }
            }
            if (min !== Infinity) {
              map.set(cardId, { min, max });
            }
          }
          return map;
        })()
      : null;

  const totalUniqueCards =
    view === "cards" ? new Set(allCards.map((c) => c.cardId)).size : allCards.length;

  const gridSelectedId =
    view === "cards" && selectedCard
      ? (deferredSortedCards.find((c) => c.cardId === selectedCard.cardId)?.id ?? selectedCard.id)
      : selectedCard?.id;

  const selectedIndex = selectedCard
    ? view === "cards"
      ? sortedCards.findIndex((c) => c.cardId === selectedCard.cardId)
      : sortedCards.findIndex((c) => c.id === selectedCard.id)
    : -1;

  const handlePrevCard =
    selectedIndex > 0 ? () => setSelectedCard(sortedCards[selectedIndex - 1]) : undefined;

  const handleNextCard =
    selectedIndex >= 0 && selectedIndex < sortedCards.length - 1
      ? () => setSelectedCard(sortedCards[selectedIndex + 1])
      : undefined;

  const handleDetailClose = () => {
    // If we pushed a history entry for mobile, pop it instead of leaving a
    // stale entry in the stack.
    if (history.state?.cardDetail) {
      history.back();
    } else {
      closeDetail();
    }
  };

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
      <FilterBar
        availableFilters={availableFilters}
        filterState={filterState}
        energyRange={[filterState.energyMin, filterState.energyMax]}
        mightRange={[filterState.mightMin, filterState.mightMax]}
        powerRange={[filterState.powerMin, filterState.powerMax]}
        priceRange={[filterState.priceMin, filterState.priceMax]}
        sortBy={sortBy}
        sortDir={sortDir}
        totalCards={totalUniqueCards}
        filteredCount={sortedCards.length}
        view={view}
        onViewChange={setView}
        hasActiveFilters={hasActiveFilters}
        searchScope={searchScope}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onToggleSigned={toggleSigned}
        onTogglePromo={togglePromo}
        onEnergyRangeChange={setEnergyRange}
        onMightRangeChange={setMightRange}
        onPowerRangeChange={setPowerRange}
        onPriceRangeChange={setPriceRange}
        onSortChange={setSortBy}
        onSortDirChange={setSortDir}
        onSearchScopeToggle={toggleSearchField}
        maxColumns={maxColumns ?? null}
        maxColumnsLimit={physicalMaxColumns}
        minColumnsLimit={physicalMinColumns}
        autoColumns={autoColumns}
        onMaxColumnsChange={setMaxColumns}
        setDisplayLabel={setDisplayLabel}
      />
      <ActiveFilters
        filterState={filterState}
        availableFilters={availableFilters}
        energyRange={[filterState.energyMin, filterState.energyMax]}
        mightRange={[filterState.mightMin, filterState.mightMax]}
        powerRange={[filterState.powerMin, filterState.powerMax]}
        priceRange={[filterState.priceMin, filterState.priceMax]}
        hasActiveFilters={hasActiveFilters}
        onToggleFilter={toggleArrayFilter}
        onClearEnergyRange={() => setEnergyRange(null, null)}
        onClearMightRange={() => setMightRange(null, null)}
        onClearPowerRange={() => setPowerRange(null, null)}
        onClearPriceRange={() => setPriceRange(null, null)}
        onClearSigned={clearSigned}
        onClearPromo={clearPromo}
        onClearAll={clearAllFilters}
        onClearSearch={() => setSearch("")}
        setDisplayLabel={setDisplayLabel}
      />

      <div className="flex items-start gap-6">
        <FilterSidebar
          availableFilters={availableFilters}
          filterState={filterState}
          onToggleFilter={toggleArrayFilter}
          onToggleSigned={toggleSigned}
          onTogglePromo={togglePromo}
          energyRange={[filterState.energyMin, filterState.energyMax]}
          mightRange={[filterState.mightMin, filterState.mightMax]}
          powerRange={[filterState.powerMin, filterState.powerMax]}
          priceRange={[filterState.priceMin, filterState.priceMax]}
          onEnergyRangeChange={setEnergyRange}
          onMightRangeChange={setMightRange}
          onPowerRangeChange={setPowerRange}
          onPriceRangeChange={setPriceRange}
          setDisplayLabel={setDisplayLabel}
        />
        <div
          className={`min-w-0 flex-1 transition-opacity duration-150 ${isGridStale ? "opacity-60" : "opacity-100"}`}
        >
          <CardGrid
            cards={deferredSortedCards}
            totalCards={allCards.length}
            setOrder={setInfoList}
            onCardClick={handleCardClick}
            onSiblingClick={handleCardClick}
            showImages={showImages}
            selectedCardId={gridSelectedId}
            priceRangeByCardId={priceRangeByCardId}
            view={view}
            siblingPrintings={siblingPrintings}
            printingsByCardId={printingsByCardId}
            cardFields={cardFields}
            maxColumns={maxColumns}
            onPhysicalMaxChange={setPhysicalMaxColumns}
            onPhysicalMinChange={setPhysicalMinColumns}
            onAutoColumnsChange={setAutoColumns}
          />
        </div>
        {selectedCard && detailOpen && (
          <Suspense fallback={<CardDetailSkeleton />}>
            <CardDetail
              card={selectedCard}
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
