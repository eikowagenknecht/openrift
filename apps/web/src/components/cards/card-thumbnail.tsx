import type { Card } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { useRef, useState } from "react";

import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { useCardTilt } from "@/hooks/use-card-tilt";
import type { CardFields } from "@/lib/card-fields";
import { DEFAULT_CARD_FIELDS } from "@/lib/card-fields";
import { getDomainGradientStyle } from "@/lib/domain";
import { formatPriceCompact, priceColorClass } from "@/lib/format";
import { getCardImageSrcSet, getCardImageUrl } from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";
import { useDisplaySettings } from "@/routes/__root";

interface CardThumbnailProps {
  card: Card;
  onClick: (card: Card) => void;
  onSiblingClick?: (card: Card) => void;
  showImages?: boolean;
  isSelected?: boolean;
  isFlashing?: boolean;
  siblings?: Card[];
  priceRange?: { min: number; max: number };
  view?: "cards" | "printings";
  cardFields?: CardFields;
  cardWidth?: number;
  priority?: boolean;
}

export function CardThumbnail({
  card,
  onClick,
  onSiblingClick,
  showImages,
  isSelected,
  isFlashing,
  siblings,
  priceRange,
  view,
  cardFields = DEFAULT_CARD_FIELDS,
  cardWidth,
  priority,
}: CardThumbnailProps) {
  const orientation = getOrientation(card.type);
  const thumbnailUrl =
    showImages && card.art.imageURL
      ? getCardImageUrl(card.art.imageURL, "thumbnail", orientation)
      : null;
  const srcSet =
    showImages && card.art.imageURL
      ? getCardImageSrcSet(card.art.imageURL, orientation)
      : undefined;
  const [imgLoaded, setImgLoaded] = useState(false);

  const { richEffects } = useDisplaySettings();
  const isFoilCard = card.finish === "foil";
  const tilt = useCardTilt({ mode: "pointer", enabled: !IS_COARSE_POINTER });
  const compact = cardWidth !== undefined && cardWidth < 190;
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== card.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = richEffects ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);

  return (
    <button
      type="button"
      className={cn(
        "group relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all hover:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        otherPrintings.length > 0 && "hover:[--fan:1]",
      )}
      onMouseEnter={
        otherPrintings.length > 0
          ? () => {
              fanTimer.current = setTimeout(() => setFanReady(true), 200);
            }
          : undefined
      }
      onMouseLeave={
        otherPrintings.length > 0
          ? () => {
              if (fanTimer.current) {
                clearTimeout(fanTimer.current);
              }
              setFanReady(false);
            }
          : undefined
      }
      style={isSelected ? getDomainGradientStyle(card.domains, "38") : undefined}
      onClick={() => onClick(card)}
    >
      {isFlashing && (
        <div
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{
            ...getDomainGradientStyle(card.domains, "C0"),
            animation: "selection-flash 800ms ease-out forwards",
          }}
        />
      )}
      <div className="relative">
        {otherPrintings.map((sibling, i) => {
          const depth = otherPrintings.length - i;
          const siblingUrl =
            richEffects && showImages && sibling.art.imageURL
              ? getCardImageUrl(sibling.art.imageURL, "thumbnail", orientation)
              : null;
          return (
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative layer inside a parent <button>; keyboard nav handled by parent
            <div
              key={sibling.id}
              className={cn(
                "absolute inset-0 origin-bottom overflow-hidden border border-[var(--border-opaque)] bg-muted pointer-events-none",
                richEffects && "hover:ring-2 hover:ring-primary/60",
                richEffects && fanReady && "pointer-events-auto cursor-pointer",
              )}
              style={{
                borderRadius: "5% / 3.6%",
                translate: `calc((1 - var(--fan, 0)) * ${depth * fanStep}px) calc((1 - var(--fan, 0)) * ${depth * fanStep}px)`,
                rotate: `calc(var(--fan, 0) * ${depth * fanAngle}deg)`,
                transition: "rotate 200ms ease-out, translate 200ms ease-out, scale 150ms ease-out",
              }}
              onClick={
                richEffects
                  ? (e) => {
                      e.stopPropagation();
                      (onSiblingClick ?? onClick)(sibling);
                    }
                  : undefined
              }
            >
              {siblingUrl && (
                <img src={siblingUrl} alt="" loading="lazy" className="size-full object-cover" />
              )}
              {sibling.finish === "foil" && <FoilOverlay active shimmer dim />}
            </div>
          );
        })}
        <div ref={tilt.containerRef} style={tilt.style} className="relative">
          <div
            ref={tilt.innerRef}
            className={cn(
              "relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-[var(--border-opaque)]",
              richEffects && "hover:ring-2 hover:ring-primary/60",
            )}
            style={{
              borderRadius: "5% / 3.6%",
              transform:
                "perspective(800px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
              transformStyle: "preserve-3d",
            }}
          >
            <CardPlaceholderImage
              name={card.name}
              domain={card.domains}
              energy={card.stats.energy}
              might={card.stats.might}
              className={thumbnailUrl && imgLoaded ? "invisible" : undefined}
            />
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                srcSet={srcSet}
                sizes={cardWidth ? `${Math.round(cardWidth - 12)}px` : undefined}
                alt={card.name}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : undefined}
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
      </div>
      {(cardFields.number ||
        cardFields.title ||
        cardFields.type ||
        cardFields.rarity ||
        cardFields.price) && (
        <div className="relative z-10 mt-2.5">
          <CardMetaLabel
            sourceId={card.sourceId}
            name={card.name}
            type={card.type}
            superTypes={card.superTypes}
            rarity={card.rarity}
            compact={compact}
            cardFields={cardFields}
          />
          {cardFields.price && card.price && (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 px-1.5 text-xs font-medium">
              {view === "cards" && priceRange && priceRange.min !== priceRange.max ? (
                <>
                  <span className={priceColorClass(priceRange.min)}>
                    {formatPriceCompact(priceRange.min)}
                  </span>
                  <span className="text-muted-foreground/60">&ndash;</span>
                  <span className={priceColorClass(priceRange.max)}>
                    {formatPriceCompact(priceRange.max)}
                  </span>
                </>
              ) : (
                <span className={priceColorClass(card.price.market)}>
                  {formatPriceCompact(card.price.market)}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </button>
  );
}
