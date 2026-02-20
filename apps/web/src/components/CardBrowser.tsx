import type { Card, RiftboundContent } from "@openrift/shared";
import { filterCards, flattenWithVariants, getAvailableFilters, sortCards } from "@openrift/shared";
import galleryData from "@openrift/shared/data/gallery.json";
import { useEffect, useMemo, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import { CardGrid } from "@/components/cards/CardGrid";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { useCardFilters } from "@/hooks/use-card-filters";

const allCards = flattenWithVariants(galleryData as RiftboundContent);

export function CardBrowser() {
  const {
    filters,
    sortBy,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setSortBy,
    filterState,
    searchScope,
    toggleSearchField,
  } = useCardFilters();

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [showImages, setShowImages] = useState(() => {
    const stored = localStorage.getItem("showImages");
    return stored !== null ? stored === "true" : true;
  });

  const handleShowImagesChange = (show: boolean) => {
    setShowImages(show);
    localStorage.setItem("showImages", String(show));
  };

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

  const availableFilters = useMemo(() => getAvailableFilters(allCards), []);
  const filteredCards = useMemo(() => filterCards(allCards, filters), [filters]);
  const sortedCards = useMemo(() => sortCards(filteredCards, sortBy), [filteredCards, sortBy]);

  const handleCardClick = (card: Card) => {
    if (detailOpen && selectedCard?.id === card.id) {
      setDetailOpen(false);
      return;
    }
    setSelectedCard(card);
    setDetailOpen(true);
  };

  const handleDetailClose = () => {
    setDetailOpen(false);
  };

  return (
    <div className="space-y-4">
      <FilterBar
        availableFilters={availableFilters}
        filterState={filterState}
        sortBy={sortBy}
        showImages={showImages}
        totalCards={allCards.length}
        filteredCount={sortedCards.length}
        hasActiveFilters={hasActiveFilters}
        searchScope={searchScope}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onSortChange={setSortBy}
        onShowImagesChange={handleShowImagesChange}
        onSearchScopeToggle={toggleSearchField}
      />
      <ActiveFilters
        filterState={filterState}
        hasActiveFilters={hasActiveFilters}
        onToggleFilter={toggleArrayFilter}
        onClearAll={clearAllFilters}
        onClearSearch={() => setSearch("")}
      />

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <CardGrid
            cards={sortedCards}
            onCardClick={handleCardClick}
            showImages={showImages}
            selectedCardId={selectedCard?.id}
          />
        </div>
        {selectedCard && detailOpen && (
          <CardDetail card={selectedCard} onClose={handleDetailClose} showImages={showImages} />
        )}
      </div>
    </div>
  );
}
