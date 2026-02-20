import type { Card, RiftboundContent } from "@openrift/shared";
import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared";
import contentData from "@openrift/shared/data/content.json";
import { useMemo, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import { CardGrid } from "@/components/cards/CardGrid";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useCardFilters } from "@/hooks/use-card-filters";

const allCards = (contentData as RiftboundContent).sets.flatMap((s) => s.cards);

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
  const [showImages, setShowImages] = useState(false);

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

      <div className="flex items-center gap-2">
        <Checkbox
          id="show-images"
          checked={showImages}
          onCheckedChange={(checked: boolean) => setShowImages(checked)}
        />
        <label htmlFor="show-images" className="text-sm cursor-pointer select-none">
          Show card images
        </label>
      </div>

      <CardGrid cards={sortedCards} onCardClick={handleCardClick} showImages={showImages} />
      <CardDetail
        card={selectedCard}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        showImages={showImages}
      />
    </div>
  );
}
