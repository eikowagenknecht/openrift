import type { Card, PricesData, RiftboundContent } from "@openrift/shared";
import { filterCards, flattenWithVariants, getAvailableFilters, sortCards } from "@openrift/shared";
import galleryData from "@openrift/shared/data/gallery.json";
import pricesJson from "@openrift/shared/data/prices.json";
import { useDeferredValue, useEffect, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import type { SetInfo } from "@/components/cards/CardGrid";
import { CardGrid } from "@/components/cards/CardGrid";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { useCardFilters } from "@/hooks/use-card-filters";

const typedGallery = galleryData as RiftboundContent;
const pricesData = pricesJson as PricesData;
const allCards = flattenWithVariants(typedGallery).map((card) => {
  const price = pricesData.cards[card.id];
  return price ? { ...card, price } : card;
});

const setInfoList: SetInfo[] = typedGallery.sets.map((s) => ({
  name: s.name,
  code: s.cards[0]?.id.replace(/-.*$/, "") ?? s.id,
}));

interface CardBrowserProps {
  showImages: boolean;
  cardFields: CardFields;
  maxColumns?: number | null;
  onMaxColumnsChange?: (value: number | null) => void;
}

export function CardBrowser({
  showImages,
  cardFields,
  maxColumns,
  onMaxColumnsChange,
}: CardBrowserProps) {
  const {
    filters,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setEnergyRange,
    setMightRange,
    setPowerRange,
    setPriceRange,
    setSortBy,
    setSortDir,
    filterState,
    searchScope,
    toggleSearchField,
  } = useCardFilters();

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [physicalMaxColumns, setPhysicalMaxColumns] = useState(8);
  const [autoColumns, setAutoColumns] = useState(5);

  // Lock body scroll when mobile overlay is active
  useEffect(() => {
    if (!detailOpen) {
      return;
    }
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [detailOpen]);

  const availableFilters = getAvailableFilters(allCards);
  const filteredCards = filterCards(allCards, filters);
  const sorted = sortCards(filteredCards, sortBy);
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
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) {
      return;
    }

    history.pushState({ cardDetail: true }, "");

    const onPopState = () => {
      setSelectedCard(null);
      setDetailOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [detailOpen]);

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
    setDetailOpen(true);
  };

  const selectedIndex = selectedCard ? sortedCards.findIndex((c) => c.id === selectedCard.id) : -1;

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
      setDetailOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        availableFilters={availableFilters}
        filterState={filterState}
        energyRange={[filterState.energyMin, filterState.energyMax]}
        mightRange={[filterState.mightMin, filterState.mightMax]}
        powerRange={[filterState.powerMin, filterState.powerMax]}
        priceRange={[filterState.priceMin, filterState.priceMax]}
        sortBy={sortBy}
        sortDir={sortDir}
        totalCards={allCards.length}
        filteredCount={sortedCards.length}
        hasActiveFilters={hasActiveFilters}
        searchScope={searchScope}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onEnergyRangeChange={setEnergyRange}
        onMightRangeChange={setMightRange}
        onPowerRangeChange={setPowerRange}
        onPriceRangeChange={setPriceRange}
        onSortChange={setSortBy}
        onSortDirChange={setSortDir}
        onSearchScopeToggle={toggleSearchField}
        maxColumns={maxColumns ?? null}
        maxColumnsLimit={physicalMaxColumns}
        autoColumns={autoColumns}
        onMaxColumnsChange={onMaxColumnsChange}
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
        onClearAll={clearAllFilters}
        onClearSearch={() => setSearch("")}
      />

      <div className="flex items-start gap-6">
        <div
          className={`min-w-0 flex-1 transition-opacity duration-150 ${isGridStale ? "opacity-60" : "opacity-100"}`}
        >
          <CardGrid
            cards={deferredSortedCards}
            setOrder={setInfoList}
            onCardClick={handleCardClick}
            showImages={showImages}
            selectedCardId={selectedCard?.id}
            cardFields={cardFields}
            maxColumns={maxColumns}
            onPhysicalMaxChange={setPhysicalMaxColumns}
            onAutoColumnsChange={setAutoColumns}
          />
        </div>
        {selectedCard && detailOpen && (
          <CardDetail
            card={selectedCard}
            onClose={handleDetailClose}
            showImages={showImages}
            onPrevCard={handlePrevCard}
            onNextCard={handleNextCard}
            onTagClick={(tag) => {
              setSearch(`t:${tag}`);
              if (window.matchMedia("(max-width: 767px)").matches) {
                handleDetailClose();
              }
            }}
            onKeywordClick={(keyword) => {
              setSearch(`k:${keyword}`);
              if (window.matchMedia("(max-width: 767px)").matches) {
                handleDetailClose();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
