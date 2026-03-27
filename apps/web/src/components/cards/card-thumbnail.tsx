import type { Domain, Finish, Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { memo, useRef, useState } from "react";

import { COMPACT_THRESHOLD } from "@/components/cards/card-grid-constants";
import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { resolvePrice } from "@/hooks/use-card-data";
import { useCardTilt } from "@/hooks/use-card-tilt";
import type { VisibleFields } from "@/lib/card-fields";
import { DEFAULT_VISIBLE_FIELDS } from "@/lib/card-fields";
import { getDomainGradientStyle } from "@/lib/domain";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import {
  LANDSCAPE_ROTATION_STYLE,
  getCardImageSrcSet,
  getCardImageUrl,
  needsCssRotation,
} from "@/lib/images";
import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

const CARD_BORDER_RADIUS = "5% / 3.6%";

const TILT_STYLE = {
  transform:
    "perspective(800px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
  transformStyle: "preserve-3d",
} as const;

const AFTER_BORDER =
  "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-[var(--border-opaque)]";

function CardImageContent({
  thumbnailUrl,
  srcSet,
  sizes,
  alt,
  priority,
  imgLoaded,
  onImgLoad,
  rotated,
  card,
  isFoilCard,
  tiltActive,
}: {
  thumbnailUrl: string | null;
  srcSet: string | undefined;
  sizes: string | undefined;
  alt: string;
  priority: boolean;
  imgLoaded: boolean;
  onImgLoad: () => void;
  rotated: boolean;
  card: {
    name: string;
    domains: Domain[];
    energy: number | null;
    might?: number | null;
    power?: number | null;
    type?: string;
    superTypes?: string[];
    tags?: string[];
    rulesText?: string | null;
    effectText?: string | null;
    mightBonus?: number | null;
    flavorText?: string | null;
  };
  isFoilCard: boolean;
  tiltActive: boolean;
}) {
  return (
    <>
      {thumbnailUrl ? (
        <>
          <div className="aspect-card bg-muted/40" />
          {rotated ? (
            <div
              className={cn(
                "absolute top-1/2 left-1/2 overflow-hidden transition-opacity duration-300",
                imgLoaded ? "opacity-100" : "opacity-0",
              )}
              style={LANDSCAPE_ROTATION_STYLE}
            >
              <img
                src={thumbnailUrl}
                srcSet={srcSet}
                sizes={sizes}
                alt={alt}
                loading={priority ? "eager" : "lazy"}
                fetchPriority={priority ? "high" : undefined}
                className="size-full object-cover"
                onLoad={onImgLoad}
              />
            </div>
          ) : (
            <img
              src={thumbnailUrl}
              srcSet={srcSet}
              sizes={sizes}
              alt={alt}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              className={cn(
                "absolute inset-0 w-full object-cover transition-opacity duration-300",
                imgLoaded ? "opacity-100" : "opacity-0",
              )}
              onLoad={onImgLoad}
            />
          )}
        </>
      ) : (
        <CardPlaceholderImage
          name={card.name}
          domain={card.domains}
          energy={card.energy}
          might={card.might}
          power={card.power}
          type={card.type}
          superTypes={card.superTypes}
          tags={card.tags}
          rulesText={card.rulesText}
          effectText={card.effectText}
          mightBonus={card.mightBonus}
          flavorText={card.flavorText}
        />
      )}
      {isFoilCard && <FoilOverlay active={tiltActive} />}
    </>
  );
}

interface CardThumbnailProps {
  printing: Printing;
  onClick: (printing: Printing) => void;
  onSiblingClick?: (printing: Printing) => void;
  showImages?: boolean;
  isSelected?: boolean;
  isFlashing?: boolean;
  siblings?: Printing[];
  priceRange?: { min: number; max: number };
  view?: "cards" | "printings";
  visibleFields?: VisibleFields;
  cardWidth?: number;
  priority?: boolean;
  ownedCount?: number;
  onAdd?: (printing: Printing, anchorEl: HTMLElement) => void;
}

// Explicit memo: rendered inside the virtualizer's items.map() which re-runs every
// scroll frame. React Compiler cannot memoize JSX created in dynamic .map() callbacks.
export const CardThumbnail = memo(function CardThumbnail({
  printing,
  onClick,
  onSiblingClick,
  showImages,
  isSelected,
  isFlashing,
  siblings,
  priceRange,
  view,
  visibleFields = DEFAULT_VISIBLE_FIELDS,
  cardWidth,
  priority,
  ownedCount,
  onAdd,
}: CardThumbnailProps) {
  const card = {
    ...printing.card,
    rulesText: printing.printedRulesText,
    effectText: printing.printedEffectText,
    flavorText: printing.flavorText,
  };
  const imageUrl = printing.images[0]?.url ?? null;
  const orientation = getOrientation(card.type);
  const thumbnailUrl = showImages && imageUrl ? getCardImageUrl(imageUrl, "thumbnail") : null;
  const srcSet = showImages && imageUrl ? getCardImageSrcSet(imageUrl) : undefined;
  const rotated = needsCssRotation(orientation);
  const [imgLoaded, setImgLoaded] = useState(false);

  const richEffects = useDisplayStore((s) => s.richEffects);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "tcgplayer";
  const favoritePrice = resolvePrice(printing, favoriteMarketplace);
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);
  const isFoilCard = printing.finish === ("foil" satisfies Finish);
  const tilt = useCardTilt({ mode: "pointer", enabled: !IS_COARSE_POINTER });
  const compact = cardWidth !== undefined && cardWidth < COMPACT_THRESHOLD;
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== printing.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = richEffects ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);
  return (
    <button
      type="button"
      className={cn(
        // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
        "group focus-visible:ring-ring relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all hover:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
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
      onClick={() => onClick(printing)}
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
        {ownedCount !== undefined && ownedCount > 0 && (
          <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 z-20 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold shadow">
            ×{ownedCount}
          </span>
        )}
        {onAdd && (
          <button
            type="button"
            tabIndex={-1}
            className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 z-20 flex size-7 cursor-pointer items-center justify-center rounded-full shadow transition-transform hover:scale-110"
            onClick={(e) => {
              e.stopPropagation();
              onAdd(printing, e.currentTarget);
            }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="size-4">
              <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
            </svg>
          </button>
        )}
        {otherPrintings.map((sibling, i) => {
          const depth = otherPrintings.length - i;
          const siblingImageUrl = sibling.images[0]?.url ?? null;
          const siblingUrl =
            richEffects && showImages && siblingImageUrl
              ? getCardImageUrl(siblingImageUrl, "thumbnail")
              : null;
          return (
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative layer inside a parent <button>; keyboard nav handled by parent
            <div
              key={sibling.id}
              className={cn(
                "bg-muted pointer-events-none absolute inset-0 origin-bottom overflow-hidden border border-[var(--border-opaque)]",
                richEffects && "hover:ring-primary/60 hover:ring-2",
                richEffects && fanReady && "pointer-events-auto cursor-pointer",
              )}
              style={{
                borderRadius: CARD_BORDER_RADIUS,
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
              {siblingUrl &&
                (rotated ? (
                  <div
                    className="absolute top-1/2 left-1/2 overflow-hidden"
                    style={LANDSCAPE_ROTATION_STYLE}
                  >
                    <img
                      src={siblingUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                ) : (
                  <img src={siblingUrl} alt="" loading="lazy" className="size-full object-cover" />
                ))}
              {sibling.finish === ("foil" satisfies Finish) && (
                <FoilOverlay active shimmer dim paused />
              )}
            </div>
          );
        })}
        <div ref={tilt.containerRef} style={tilt.style} className="relative">
          {rotated ? (
            <div className="relative overflow-hidden" style={{ borderRadius: CARD_BORDER_RADIUS }}>
              <div
                ref={tilt.innerRef}
                className={cn(AFTER_BORDER, richEffects && "hover:ring-primary/60 hover:ring-2")}
                style={{ borderRadius: "inherit", ...TILT_STYLE }}
              >
                <CardImageContent
                  thumbnailUrl={thumbnailUrl}
                  srcSet={srcSet}
                  sizes={cardWidth ? `${Math.round(cardWidth - 12)}px` : undefined}
                  alt={card.name}
                  priority={Boolean(priority)}
                  imgLoaded={imgLoaded}
                  onImgLoad={() => setImgLoaded(true)}
                  rotated
                  card={card}
                  isFoilCard={isFoilCard}
                  tiltActive={tilt.active}
                />
              </div>
            </div>
          ) : (
            <div
              ref={tilt.innerRef}
              className={cn(
                "relative overflow-hidden",
                AFTER_BORDER,
                richEffects && "hover:ring-primary/60 hover:ring-2",
              )}
              style={{ borderRadius: CARD_BORDER_RADIUS, ...TILT_STYLE }}
            >
              <CardImageContent
                thumbnailUrl={thumbnailUrl}
                srcSet={srcSet}
                sizes={cardWidth ? `${Math.round(cardWidth - 12)}px` : undefined}
                alt={card.name}
                priority={Boolean(priority)}
                imgLoaded={imgLoaded}
                onImgLoad={() => setImgLoaded(true)}
                rotated={false}
                card={card}
                isFoilCard={isFoilCard}
                tiltActive={tilt.active}
              />
            </div>
          )}
        </div>
      </div>
      {(visibleFields.number ||
        visibleFields.title ||
        visibleFields.type ||
        visibleFields.rarity ||
        visibleFields.price) && (
        // ⚠ mt-2.5 is mirrored as LABEL_WRAPPER_MT in card-grid.tsx — update both together
        <div className="relative z-10 mt-2.5">
          <CardMetaLabel
            shortCode={printing.shortCode}
            name={card.name}
            type={card.type}
            superTypes={card.superTypes}
            rarity={printing.rarity}
            compact={compact}
            visibleFields={visibleFields}
          />
          {/* // ⚠ mt-0.5 / text-xs / min-h-4 are mirrored as PRICE_MT / PRICE_LINE_HEIGHT in card-grid.tsx — update both together */}
          {/* // custom: always render the price <p> (with min-h-4) so rows have uniform height even when favoritePrice is undefined */}
          {visibleFields.price && (
            <p className="mt-0.5 flex min-h-4 flex-wrap items-center gap-1 px-1.5 text-xs font-medium">
              {favoritePrice !== undefined &&
                (view === "cards" && priceRange && priceRange.min !== priceRange.max ? (
                  <>
                    <span className={priceColorClass(priceRange.min)}>
                      {compactFmt(priceRange.min)}
                    </span>
                    <span className="text-muted-foreground/60">&ndash;</span>
                    <span className={priceColorClass(priceRange.max)}>
                      {compactFmt(priceRange.max)}
                    </span>
                  </>
                ) : (
                  <span className={priceColorClass(favoritePrice)}>
                    {compactFmt(favoritePrice)}
                  </span>
                ))}
            </p>
          )}
        </div>
      )}
    </button>
  );
});
