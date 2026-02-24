import type { Card } from "@openrift/shared";
import { useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/CardPlaceholderImage";
import { FoilOverlay } from "@/components/cards/FoilOverlay";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatCardId, formatPrice } from "@/lib/format";
import { getCardImageUrl } from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

export interface CardFields {
  number: boolean;
  title: boolean;
  type: boolean;
  supertype: boolean;
  rarity: boolean;
  price: boolean;
}

export const DEFAULT_CARD_FIELDS: CardFields = {
  number: true,
  title: true,
  type: true,
  supertype: true,
  rarity: true,
  price: true,
};

interface CardThumbnailProps {
  card: Card;
  onClick: (card: Card) => void;
  showImages?: boolean;
  isSelected?: boolean;
  cardFields?: CardFields;
}

export function CardThumbnail({
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
  const [imgLoaded, setImgLoaded] = useState(false);

  const isFoilCard = Boolean(card.price?.foil) && !card.price?.normal;
  const tilt = useCardTilt({ mode: "pointer", enabled: !IS_COARSE_POINTER });

  return (
    <button
      type="button"
      className={cn(
        "group relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      style={isSelected ? getDomainGradientStyle(card.faction, "38") : undefined}
      onClick={() => onClick(card)}
    >
      <div ref={tilt.containerRef} style={tilt.style}>
        <div
          ref={tilt.innerRef}
          className="relative overflow-hidden"
          style={{
            borderRadius: "5% / 3.6%",
            transform: "rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
            transformStyle: "preserve-3d",
          }}
        >
          <CardPlaceholderImage
            name={card.name}
            domain={card.faction}
            energy={card.stats.energy}
            might={card.stats.might}
            className={thumbnailUrl && imgLoaded ? "invisible" : undefined}
          />
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt={card.name}
              loading="lazy"
              className={cn(
                "absolute inset-0 aspect-[744/1039] w-full object-cover transition-opacity duration-300",
                imgLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={() => setImgLoaded(true)}
            />
          )}
          {isFoilCard && <FoilOverlay active={tilt.active} />}
        </div>
      </div>
      {(cardFields.number ||
        cardFields.title ||
        cardFields.type ||
        cardFields.rarity ||
        cardFields.price) && (
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
          {cardFields.price && card.price && (
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {card.price.normal && (
                <span>
                  {formatPrice(card.price.normal.market)}
                  {card.price.foil && (
                    <span className="ml-0.5 text-[10px] text-muted-foreground">normal</span>
                  )}
                </span>
              )}
              {card.price.normal && card.price.foil && (
                <span className="text-muted-foreground">&middot;</span>
              )}
              {card.price.foil && (
                <span>
                  {formatPrice(card.price.foil.market)}
                  {card.price.normal && (
                    <span className="ml-0.5 text-[10px] text-muted-foreground">foil</span>
                  )}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </button>
  );
}
