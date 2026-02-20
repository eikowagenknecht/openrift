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
        <CardPlaceholderImage
          name={card.name}
          rarity={card.rarity}
          type={card.type}
          domain={card.domain}
          cost={card.cost}
          attack={card.stats?.attack}
        />
      </div>
      <div className="mt-1.5 space-y-0.5 px-0.5">
        <p className="truncate text-sm font-medium">{card.name}</p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <img src={`/icons/types/${card.type.toLowerCase()}.webp`} alt="" className="size-3.5" />
          {card.type}
          <span>&middot;</span>
          <img
            src={`/icons/rarities/${card.rarity.toLowerCase()}.webp`}
            alt=""
            className="size-3.5"
          />
          {card.rarity}
        </p>
      </div>
    </button>
  );
}
