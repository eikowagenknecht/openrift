import type { Card, RiftboundContent } from "@openrift/shared";
import { filterCards, flattenWithVariants, getAvailableFilters, sortCards } from "@openrift/shared";
import galleryData from "@openrift/shared/data/gallery.json";
import { useEffect, useMemo, useState } from "react";

import { CardDetail } from "@/components/cards/CardDetail";
import type { SetInfo } from "@/components/cards/CardGrid";
import { CardGrid } from "@/components/cards/CardGrid";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { DEFAULT_CARD_FIELDS } from "@/components/cards/CardThumbnail";
import { ActiveFilters } from "@/components/filters/ActiveFilters";
import { FilterBar } from "@/components/filters/FilterBar";
import { useCardFilters } from "@/hooks/use-card-filters";

const typedGallery = galleryData as RiftboundContent;
const allCards = flattenWithVariants(typedGallery);

const setInfoList: SetInfo[] = typedGallery.sets.map((s) => ({
  name: s.name,
  code: s.cards[0]?.id.replace(/-.*$/, "") ?? s.id,
}));

export function CardBrowser() {
  const {
    filters,
    sortBy,
    sortDir,
    hasActiveFilters,
    clearAllFilters,
    setSearch,
    toggleArrayFilter,
    setSortBy,
    setSortDir,
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
  const [cardFields, setCardFields] = useState<CardFields>(() => {
    const stored = localStorage.getItem("cardFields");
    if (stored) {
      try {
        return { ...DEFAULT_CARD_FIELDS, ...JSON.parse(stored) };
      } catch {
        // ignore malformed JSON
      }
    }
    return DEFAULT_CARD_FIELDS;
  });

  const handleShowImagesChange = (show: boolean) => {
    setShowImages(show);
    localStorage.setItem("showImages", String(show));
  };

  const handleCardFieldsChange = (update: Partial<CardFields>) => {
    setCardFields((prev) => {
      const next = { ...prev, ...update };
      localStorage.setItem("cardFields", JSON.stringify(next));
      return next;
    });
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
  const sortedCards = useMemo(() => {
    const sorted = sortCards(filteredCards, sortBy);
    return sortDir === "desc" ? sorted.toReversed() : sorted;
  }, [filteredCards, sortBy, sortDir]);

  const handleCardClick = (card: Card) => {
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
        sortDir={sortDir}
        showImages={showImages}
        totalCards={allCards.length}
        filteredCount={sortedCards.length}
        hasActiveFilters={hasActiveFilters}
        searchScope={searchScope}
        onSearchChange={setSearch}
        onToggleFilter={toggleArrayFilter}
        onSortChange={setSortBy}
        onSortDirChange={setSortDir}
        onShowImagesChange={handleShowImagesChange}
        onSearchScopeToggle={toggleSearchField}
        cardFields={cardFields}
        onCardFieldsChange={handleCardFieldsChange}
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
            setOrder={setInfoList}
            onCardClick={handleCardClick}
            showImages={showImages}
            selectedCardId={selectedCard?.id}
            cardFields={cardFields}
          />
        </div>
        {selectedCard && detailOpen && (
          <CardDetail card={selectedCard} onClose={handleDetailClose} showImages={showImages} />
        )}
      </div>
    </div>
  );
}
