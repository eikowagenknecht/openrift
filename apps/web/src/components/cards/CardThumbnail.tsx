import type { Card } from "@openrift/shared";

import { CardPlaceholderImage } from "@/components/cards/CardPlaceholderImage";

interface CardThumbnailProps {
  card: Card;
  onClick: (card: Card) => void;
}

export function CardThumbnail({ card, onClick }: CardThumbnailProps) {
  return (
    <button
      type="button"
      className="group relative w-full cursor-pointer text-left transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
      onClick={() => onClick(card)}
    >
      <div className="relative">
        <CardPlaceholderImage name={card.name} rarity={card.rarity} type={card.type} />
        <div className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {card.cost}
        </div>
      </div>
      <div className="mt-1.5 space-y-0.5 px-0.5">
        <p className="truncate text-sm font-medium">{card.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {card.type} &middot; {card.rarity}
        </p>
      </div>
    </button>
  );
}
