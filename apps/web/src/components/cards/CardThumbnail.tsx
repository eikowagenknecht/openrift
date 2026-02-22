import type { Card } from "@openrift/shared";
import { memo } from "react";

import { CardPlaceholderImage } from "@/components/cards/CardPlaceholderImage";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatCardId } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

export interface CardFields {
  number: boolean;
  title: boolean;
  type: boolean;
  supertype: boolean;
  rarity: boolean;
}

export const DEFAULT_CARD_FIELDS: CardFields = {
  number: true,
  title: true,
  type: true,
  supertype: true,
  rarity: true,
};

interface CardThumbnailProps {
  card: Card;
  onClick: (card: Card) => void;
  showImages?: boolean;
  isSelected?: boolean;
  cardFields?: CardFields;
}

export const CardThumbnail = memo(function CardThumbnail({
  card,
  onClick,
  showImages,
  isSelected,
  cardFields = DEFAULT_CARD_FIELDS,
}: CardThumbnailProps) {
  const cardId = formatCardId(card);
  const thumbnailUrl =
    showImages && card.art.thumbnailURL
      ? getCardImageUrl(card.art.thumbnailURL, "thumbnail", card.orientation)
      : null;

  return (
    <button
      type="button"
      className={cn(
        "group relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      style={isSelected ? getDomainGradientStyle(card.faction, "38") : undefined}
      onClick={() => onClick(card)}
    >
      <div className="relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={card.name}
            loading="lazy"
            className="aspect-[744/1039] w-full rounded-lg object-cover"
          />
        ) : (
          <CardPlaceholderImage
            name={card.name}
            domain={card.faction}
            energy={card.stats.energy}
            might={card.stats.might}
          />
        )}
      </div>
      {(cardFields.number || cardFields.title || cardFields.type || cardFields.rarity) && (
        <div className="mt-1.5 space-y-0.5 px-0.5">
          {(cardFields.number || cardFields.title) && (
            <p className="truncate text-xs font-medium sm:text-sm">
              {cardFields.number && <span className="text-muted-foreground">{cardId}</span>}
              {cardFields.number && cardFields.title && " "}
              {cardFields.title && card.name}
            </p>
          )}
          {(cardFields.type || cardFields.rarity) && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {cardFields.type && (
                <>
                  <img
                    src={`/icons/types/${card.type.toLowerCase()}.svg`}
                    alt=""
                    className="size-3.5 brightness-0 dark:invert"
                  />
                  {cardFields.supertype && card.superTypes.length > 0
                    ? `${card.superTypes.join(" ")} ${card.type}`
                    : card.type}
                </>
              )}
              {cardFields.type && cardFields.rarity && <span>&middot;</span>}
              {cardFields.rarity && (
                <>
                  <img
                    src={`/icons/rarities/${card.rarity.toLowerCase()}.webp`}
                    alt=""
                    className="size-3.5"
                  />
                  {card.rarity}
                </>
              )}
            </p>
          )}
        </div>
      )}
    </button>
  );
});
