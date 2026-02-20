import type { Card, RiftboundContent } from "@openrift/shared";
import { filterCards, getAvailableFilters, sortCards } from "@openrift/shared";
import galleryData from "@openrift/shared/data/gallery.json";
import { Menu } from "lucide-react";
import { useMemo, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import { CardGrid } from "@/components/cards/CardGrid";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCardFilters } from "@/hooks/use-card-filters";

const allCards = (galleryData as RiftboundContent).sets.flatMap((s) => s.cards);

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
  const [showImages, setShowImages] = useState(true);

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
      <div className="flex items-center justify-between gap-2">
        <ActiveFilters
          filterState={filterState}
          hasActiveFilters={hasActiveFilters}
          totalCards={allCards.length}
          filteredCount={sortedCards.length}
          onToggleFilter={toggleArrayFilter}
          onClearAll={clearAllFilters}
          onClearSearch={() => setSearch("")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Menu className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem checked={showImages} onCheckedChange={setShowImages}>
              Show card images
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
