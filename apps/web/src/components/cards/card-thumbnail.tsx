import { useDraggable } from "@dnd-kit/core";
import type { Domain, Printing, Rarity } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";
import { SparkleIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { memo, useRef, useState } from "react";

import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
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
/** Intrinsic dimensions matching the standard card aspect ratio (63×88mm). */
const CARD_WIDTH = 630;
const CARD_HEIGHT = 880;

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
  rarity,
  publicCode,
  artist,
  card,
  showFoil,
}: {
  thumbnailUrl: string | null;
  srcSet: string | undefined;
  sizes: string | undefined;
  alt: string;
  priority: boolean;
  imgLoaded: boolean;
  onImgLoad: () => void;
  rotated: boolean;
  rarity: Rarity;
  publicCode: string;
  artist: string;
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
  showFoil: boolean;
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
                width={CARD_HEIGHT}
                height={CARD_WIDTH}
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
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
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
          rarity={rarity}
          publicCode={publicCode}
          artist={artist}
        />
      )}
      {showFoil && <FoilOverlay active />}
    </>
  );
}

interface CardThumbnailProps {
  printing: Printing;
  onClick: (printing: Printing, event?: ReactMouseEvent) => void;
  onSiblingClick?: (printing: Printing) => void;
  showImages?: boolean;
  isSelected?: boolean;
  isFlashing?: boolean;
  siblings?: Printing[];
  priceRange?: { min: number; max: number };
  view?: "cards" | "printings";
  cardWidth?: number;
  priority?: boolean;
  /** Content rendered above the card image (e.g. OwnedCountStrip). */
  aboveCard?: ReactNode;
  /** Dims the card image (used in add mode for unowned cards). */
  dimmed?: boolean;
  /** Custom top slot (add strip) rendered above the card image. */
  topSlot?: ReactNode;
  /** Applies domain gradient background (used for "in deck" highlight). */
  highlighted?: boolean; // custom: deckbuilder highlights cards already in the deck
  /** When provided, makes the card draggable with this data (used by deckbuilder). */
  dragData?: Record<string, unknown>; // custom: passed to @dnd-kit useDraggable
  /** Unique drag ID (required when dragData is set). */
  dragId?: string; // custom: @dnd-kit draggable ID
  /** Shows a large diagonal "BANNED" overlay on the card image. */
  showBanOverlay?: boolean; // custom: deckbuilder banned card overlay
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
  cardWidth,
  priority,
  aboveCard,
  dimmed,
  topSlot,
  highlighted,
  dragData,
  dragId,
  showBanOverlay,
}: CardThumbnailProps) {
  const card = {
    ...printing.card,
    name: printing.printedName ?? printing.card.name,
    rulesText: printing.printedRulesText,
    effectText: printing.printedEffectText,
    flavorText: printing.flavorText,
  };
  const domainColors = useDomainColors();
  const imageUrl = printing.images[0]?.url ?? null;
  const orientation = getOrientation(card.type);
  const thumbnailUrl = showImages && imageUrl ? getCardImageUrl(imageUrl, "thumbnail") : null;
  const srcSet = showImages && imageUrl ? getCardImageSrcSet(imageUrl) : undefined;
  const rotated = needsCssRotation(orientation);
  const [imgLoaded, setImgLoaded] = useState(false);

  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const gridFoil = foilEffect;
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "tcgplayer";
  const prices = usePrices();
  const favoritePrice = prices.get(printing.id, favoriteMarketplace);
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);
  const isFoilCard = printing.finish === WellKnown.finish.FOIL;
  const tilt = useCardTilt({ mode: "pointer", enabled: cardTilt && !IS_COARSE_POINTER });
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== printing.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = fancyFan ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // custom: large diagonal "BANNED" overlay for deckbuilder
  const banOverlay = showBanOverlay && printing.card.bans.length > 0 && (
    <div className="@container pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-[inherit]">
      <div className="absolute inset-0 bg-black/70" />
      <span
        className="relative text-[15cqi] font-black tracking-widest text-red-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none"
        style={{ transform: "rotate(-45deg)" }}
      >
        BANNED
      </span>
    </div>
  );

  const imageSection = (
    <div className={cn("relative", dimmed && "opacity-50")}>
      {otherPrintings.map((sibling, i) => {
        const depth = otherPrintings.length - i;
        const siblingImageUrl = sibling.images[0]?.url ?? null;
        const siblingUrl =
          fancyFan && showImages && siblingImageUrl
            ? getCardImageUrl(siblingImageUrl, "thumbnail")
            : null;
        return (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative layer inside a parent <button>; keyboard nav handled by parent
          <div
            key={sibling.id}
            className={cn(
              "bg-muted pointer-events-none absolute inset-0 origin-bottom overflow-hidden border border-[var(--border-opaque)]",
              "hover:ring-primary/60 hover:ring-2",
              fanReady && "pointer-events-auto cursor-pointer",
            )}
            style={{
              borderRadius: CARD_BORDER_RADIUS,
              translate: `calc((1 - var(--fan, 0)) * ${depth * fanStep}px) calc((1 - var(--fan, 0)) * ${depth * fanStep}px)`,
              rotate: `calc(var(--fan, 0) * ${depth * fanAngle}deg)`,
              transition: "rotate 200ms ease-out, translate 200ms ease-out, scale 150ms ease-out",
            }}
            onClick={(e) => {
              e.stopPropagation();
              (onSiblingClick ?? onClick)(sibling);
            }}
          >
            {siblingUrl &&
              (rotated ? (
                <div
                  className="absolute top-1/2 left-1/2 overflow-hidden"
                  style={LANDSCAPE_ROTATION_STYLE}
                >
                  <img src={siblingUrl} alt="" loading="lazy" className="size-full object-cover" />
                </div>
              ) : (
                <img src={siblingUrl} alt="" loading="lazy" className="size-full object-cover" />
              ))}
            {sibling.finish === WellKnown.finish.FOIL && gridFoil && <FoilOverlay active dim />}
            {sibling.finish === WellKnown.finish.FOIL && (
              <SparkleIcon className="absolute top-1.5 right-1.5 z-20 size-4 fill-amber-400 text-amber-400 drop-shadow" />
            )}
          </div>
        );
      })}
      <div ref={tilt.containerRef} style={tilt.style} className="relative">
        {rotated ? (
          <div className="relative overflow-hidden" style={{ borderRadius: CARD_BORDER_RADIUS }}>
            <div
              ref={tilt.innerRef}
              className={cn(AFTER_BORDER, "hover:ring-primary/60 hover:ring-2")}
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
                rarity={printing.rarity}
                publicCode={printing.publicCode}
                artist={printing.artist}
                card={card}
                showFoil={isFoilCard && gridFoil}
              />
              {banOverlay}
            </div>
          </div>
        ) : (
          <div
            ref={tilt.innerRef}
            className={cn(
              "relative overflow-hidden",
              AFTER_BORDER,
              "hover:ring-primary/60 hover:ring-2",
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
              rarity={printing.rarity}
              publicCode={printing.publicCode}
              artist={printing.artist}
              card={card}
              showFoil={isFoilCard && gridFoil}
            />
            {banOverlay}
          </div>
        )}
      </div>
    </div>
  );

  const priceNode =
    favoritePrice === undefined ? undefined : view === "cards" &&
      priceRange &&
      priceRange.min !== priceRange.max ? (
      <span className="flex shrink-0 items-center gap-0.5">
        <span className={priceColorClass(priceRange.min)}>{compactFmt(priceRange.min)}</span>
        <span className="text-muted-foreground/60">&ndash;</span>
        <span className={priceColorClass(priceRange.max)}>{compactFmt(priceRange.max)}</span>
      </span>
    ) : (
      <span className={cn("shrink-0", priceColorClass(favoritePrice))}>
        {compactFmt(favoritePrice)}
      </span>
    );

  const labelSection = (
    // ⚠ mt-2.5 is mirrored as LABEL_WRAPPER_MT in card-grid.tsx — update both together
    <div className="relative z-10 mt-2.5">
      <CardMetaLabel
        shortCode={printing.shortCode}
        name={card.name}
        type={card.type}
        superTypes={card.superTypes}
        rarity={printing.rarity}
        isFoil={isFoilCard}
        bans={showBanOverlay ? undefined : printing.card.bans}
        hasRulesDeviation={printing.card.errata !== null}
        price={priceNode}
      />
    </div>
  );

  const flashOverlay = isFlashing && (
    <div
      className="pointer-events-none absolute inset-0 rounded-lg"
      style={{
        ...getDomainGradientStyle(card.domains, "C0", domainColors),
        animation: "selection-flash 800ms ease-out forwards",
      }}
    />
  );

  const fanMouseEnter =
    otherPrintings.length > 0
      ? () => {
          fanTimer.current = setTimeout(() => setFanReady(true), 200);
        }
      : undefined;

  const fanMouseLeave =
    otherPrintings.length > 0
      ? () => {
          if (fanTimer.current) {
            clearTimeout(fanTimer.current);
          }
          setFanReady(false);
        }
      : undefined;

  // custom: optional drag support for deckbuilder browser cards (disabled on mobile)
  const isMobile = useIsMobile();
  const enableDrag = Boolean(dragData) && !isMobile;
  const {
    setNodeRef: dragRef,
    listeners: dragListeners,
    attributes: dragAttributes,
    isDragging,
  } = useDraggable({
    id: dragId ?? `card-${printing.id}`,
    data: dragData,
    disabled: !enableDrag,
  });

  /* ── Top-slot mode: outer <div> is inert, only the image area is a <button> ── */
  if (topSlot) {
    return (
      <div
        ref={enableDrag ? dragRef : undefined}
        className={cn(
          // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
          "group relative w-full rounded-lg p-1.5 text-left transition-all hover:z-10",
          otherPrintings.length > 0 && "hover:[--fan:1]",
          isDragging && "opacity-40",
          enableDrag && "select-none",
        )}
        style={
          isSelected || highlighted
            ? getDomainGradientStyle(card.domains, "38", domainColors)
            : undefined
        }
        onMouseEnter={fanMouseEnter}
        onMouseLeave={fanMouseLeave}
        {...(enableDrag ? { ...dragListeners, ...dragAttributes } : {})}
      >
        {flashOverlay}
        {topSlot}
        <button
          type="button"
          className="focus-visible:ring-ring block w-full cursor-pointer text-left focus-visible:ring-2 focus-visible:outline-none"
          onClick={(e) => onClick(printing, e)}
        >
          {imageSection}
        </button>
        {labelSection}
      </div>
    );
  }

  /* ── Normal mode: only the image area is clickable ── */
  return (
    <div
      className={cn(
        // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
        "group relative w-full rounded-lg p-1.5 text-left transition-all hover:z-10",
        otherPrintings.length > 0 && "hover:[--fan:1]",
      )}
      onMouseEnter={fanMouseEnter}
      onMouseLeave={fanMouseLeave}
      style={
        isSelected || highlighted
          ? getDomainGradientStyle(card.domains, "38", domainColors)
          : undefined
      }
    >
      {flashOverlay}
      {aboveCard}
      <button
        type="button"
        className="focus-visible:ring-ring block w-full cursor-pointer text-left focus-visible:ring-2 focus-visible:outline-none"
        onClick={(e) => onClick(printing, e)}
      >
        {imageSection}
      </button>
      {labelSection}
    </div>
  );
});
