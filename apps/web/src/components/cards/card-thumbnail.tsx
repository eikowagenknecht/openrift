import type { Domain, Finish, Printing } from "@openrift/shared";
import { getOrientation } from "@openrift/shared";
import { memo, useRef, useState } from "react";

import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { resolvePrice } from "@/hooks/use-card-data";
import { useCardTilt } from "@/hooks/use-card-tilt";
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
import { useAddModeStore } from "@/stores/add-mode-store";
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
      {showFoil && <FoilOverlay active />}
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
  cardWidth?: number;
  priority?: boolean;
  ownedCount?: number;
  totalOwnedCount?: number;
  onQuickAdd?: (printing: Printing) => void;
  onUndoAdd?: (printing: Printing) => void;
  onOpenVariants?: (printing: Printing, anchorEl: HTMLElement) => void;
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
  ownedCount,
  totalOwnedCount,
  onQuickAdd,
  onUndoAdd,
  onOpenVariants,
}: CardThumbnailProps) {
  const sessionAddedCount = useAddModeStore((s) => s.addedItems.get(printing.id)?.quantity ?? 0);
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

  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const gridFoil = foilEffect !== "none";
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "tcgplayer";
  const favoritePrice = resolvePrice(printing, favoriteMarketplace);
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);
  const isFoilCard = printing.finish === ("foil" satisfies Finish);
  const tilt = useCardTilt({ mode: "pointer", enabled: cardTilt && !IS_COARSE_POINTER });
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== printing.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = fancyFan ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const imageSection = (
    <div className="relative">
      {/* Owned count overlay — hidden when add strip is active */}
      {!onQuickAdd && ownedCount !== undefined && ownedCount > 0 && (
        <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 z-20 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold shadow">
          ×{ownedCount}
        </span>
      )}
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
            {sibling.finish === ("foil" satisfies Finish) && gridFoil && <FoilOverlay active dim />}
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
                card={card}
                showFoil={isFoilCard && gridFoil}
              />
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
              card={card}
              showFoil={isFoilCard && gridFoil}
            />
          </div>
        )}
      </div>
    </div>
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
      />
      {/* // ⚠ mt-0.5 / text-xs / min-h-4 are mirrored as PRICE_MT / PRICE_LINE_HEIGHT in card-grid.tsx — update both together */}
      {/* // custom: always render the price <p> (with min-h-4) so rows have uniform height even when favoritePrice is undefined */}
      <p className="mt-0.5 flex min-h-4 flex-wrap items-center gap-1 px-1.5 text-xs font-medium">
        {favoritePrice !== undefined &&
          (view === "cards" && priceRange && priceRange.min !== priceRange.max ? (
            <>
              <span className={priceColorClass(priceRange.min)}>{compactFmt(priceRange.min)}</span>
              <span className="text-muted-foreground/60">&ndash;</span>
              <span className={priceColorClass(priceRange.max)}>{compactFmt(priceRange.max)}</span>
            </>
          ) : (
            <span className={priceColorClass(favoritePrice)}>{compactFmt(favoritePrice)}</span>
          ))}
      </p>
    </div>
  );

  const flashOverlay = isFlashing && (
    <div
      className="pointer-events-none absolute inset-0 rounded-lg"
      style={{
        ...getDomainGradientStyle(card.domains, "C0"),
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

  /* ── Add mode: outer <div> is inert, only the image area is a <button> ── */
  if (onQuickAdd) {
    return (
      <div
        className={cn(
          // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
          "group relative w-full rounded-lg p-1.5 text-left transition-all hover:z-10",
          otherPrintings.length > 0 && "hover:[--fan:1]",
        )}
        style={isSelected ? getDomainGradientStyle(card.domains, "38") : undefined}
        onMouseEnter={fanMouseEnter}
        onMouseLeave={fanMouseLeave}
      >
        {flashOverlay}
        {/* Add-mode control strip: [-] count [+] above the card image */}
        <AddStrip
          printing={printing}
          ownedCount={ownedCount ?? 0}
          totalOwnedCount={totalOwnedCount}
          sessionAddedCount={sessionAddedCount ?? 0}
          hasVariants={view === "cards" && (siblings?.length ?? 0) > 1}
          onQuickAdd={onQuickAdd}
          onUndoAdd={onUndoAdd}
          onOpenVariants={onOpenVariants}
        />
        <button
          type="button"
          className="focus-visible:ring-ring w-full cursor-pointer focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => onClick(printing)}
        >
          {imageSection}
        </button>
        {labelSection}
      </div>
    );
  }

  /* ── Normal mode: the whole card is a single <button> ── */
  return (
    <button
      type="button"
      className={cn(
        // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
        "group focus-visible:ring-ring relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all hover:z-10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        otherPrintings.length > 0 && "hover:[--fan:1]",
      )}
      onMouseEnter={fanMouseEnter}
      onMouseLeave={fanMouseLeave}
      style={isSelected ? getDomainGradientStyle(card.domains, "38") : undefined}
      onClick={() => onClick(printing)}
    >
      {flashOverlay}
      {imageSection}
      {labelSection}
    </button>
  );
});

/**
 * Compact [-] count [+] strip rendered above the card image in add mode.
 * @returns The add-mode control strip.
 */
function AddStrip({
  printing,
  ownedCount,
  totalOwnedCount,
  sessionAddedCount,
  hasVariants,
  onQuickAdd,
  onUndoAdd,
  onOpenVariants,
}: {
  printing: Printing;
  ownedCount: number;
  totalOwnedCount?: number;
  sessionAddedCount: number;
  hasVariants: boolean;
  onQuickAdd: (printing: Printing) => void;
  onUndoAdd?: (printing: Printing) => void;
  onOpenVariants?: (printing: Printing, anchorEl: HTMLElement) => void;
}) {
  return (
    // ⚠ h-5 + mb-1 = 24px is mirrored as ADD_STRIP_HEIGHT in card-grid-constants — update both together
    <div className="relative z-10 mb-1 flex h-5 items-center justify-between">
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onUndoAdd?.(printing);
        }}
        disabled={!sessionAddedCount}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
          <path d="M3 7a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H3z" />
        </svg>
      </button>

      {hasVariants && onOpenVariants ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpenVariants(printing, e.currentTarget);
          }}
          className={cn(
            "hover:text-foreground hover:bg-muted/50 rounded-sm px-1 text-xs font-medium transition-colors",
            ownedCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          ×{ownedCount}
          {totalOwnedCount !== undefined && totalOwnedCount !== ownedCount && (
            <span
              className={ownedCount > 0 ? "text-muted-foreground/60" : "text-muted-foreground/30"}
            >
              {" "}
              ({totalOwnedCount})
            </span>
          )}
        </button>
      ) : (
        <span
          className={cn(
            "text-xs font-medium",
            ownedCount > 0 ? "text-muted-foreground" : "text-muted-foreground/40",
          )}
        >
          ×{ownedCount}
        </span>
      )}

      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onQuickAdd(printing);
        }}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-5 items-center justify-center rounded transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5">
          <path d="M8 2a1 1 0 0 1 1 1v4h4a1 1 0 1 1 0 2H9v4a1 1 0 1 1-2 0V9H3a1 1 0 0 1 0-2h4V3a1 1 0 0 1 1-1z" />
        </svg>
      </button>
    </div>
  );
}
