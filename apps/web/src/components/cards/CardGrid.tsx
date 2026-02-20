import type { Card } from "@openrift/shared";

import { useResponsiveColumns } from "@/hooks/use-responsive-columns";

import { CardThumbnail } from "./CardThumbnail";

interface CardGridProps {
  cards: Card[];
  onCardClick: (card: Card) => void;
  showImages?: boolean;
  selectedCardId?: string;
}

export function CardGrid({ cards, onCardClick, showImages, selectedCardId }: CardGridProps) {
  const { containerRef, columns } = useResponsiveColumns();

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium text-muted-foreground">No cards found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cards.map((card) => (
        <CardThumbnail
          key={card.id}
          card={card}
          onClick={onCardClick}
          showImages={showImages}
          isSelected={card.id === selectedCardId}
        />
      ))}
    </div>
  );
}
