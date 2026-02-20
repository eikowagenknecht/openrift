import type { Card } from "@openrift/shared";
import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared";
import cardsData from "@openrift/shared/data/cards.json";
import { useMemo, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import { CardGrid } from "@/components/cards/CardGrid";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { useCardFilters } from "@/hooks/use-card-filters";

const allCards = cardsData as Card[];

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
  } = useCardFilters();

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const availableFilters = useMemo(() => getAvailableFilters(allCards), []);
  const filteredCards = useMemo(() => filterCards(allCards, filters), [filters]);
  const sortedCards = useMemo(() => sortCards(filteredCards, sortBy), [filteredCards, sortBy]);

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <FilterBar
        availableFilters={availableFilters}
        filterState={filterState}
        sortBy={sortBy}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onSortChange={setSortBy}
      />
      <ActiveFilters
        filterState={filterState}
        hasActiveFilters={hasActiveFilters}
        totalCards={allCards.length}
        filteredCount={sortedCards.length}
        onToggleFilter={toggleArrayFilter}
        onClearAll={clearAllFilters}
        onClearSearch={() => setSearch("")}
      />
      <CardGrid cards={sortedCards} onCardClick={handleCardClick} />
      <CardDetail card={selectedCard} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
