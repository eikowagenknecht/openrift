import { useDraggable } from "@dnd-kit/core";
import type { Domain, Printing, Rarity } from "@openrift/shared";
import { WellKnown, getOrientation } from "@openrift/shared";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { memo, useRef, useState } from "react";

import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FinishIcon } from "@/components/cards/finish-icon";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
import { getDomainGradientStyle } from "@/lib/domain";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
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

const SHELL_INNER_CLASS = cn("relative", AFTER_BORDER, "hover:ring-primary/60 hover:ring-2");

// Tilt shell: wraps card image content with refs wired to useCardTilt and
// applies TILT_STYLE (perspective + preserve-3d), promoting the card to its
// own compositing layer for the tilt animation.
function TiltImageShell({ children }: { children: ReactNode }) {
  const { containerRef, innerRef } = useCardTilt({ mode: "pointer", enabled: true });
  return (
    <div ref={containerRef} className="relative">
      <div
        ref={innerRef}
        className={SHELL_INNER_CLASS}
        style={{ borderRadius: CARD_BORDER_RADIUS, ...TILT_STYLE }}
      >
        {children}
      </div>
    </div>
  );
}

// Plain shell: same DOM structure but no useCardTilt call and no TILT_STYLE.
// Skipping the hook removes per-card useEffect bookkeeping; skipping the
// transform keeps cards on the default 2D paint path during scroll.
function PlainImageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className={SHELL_INNER_CLASS} style={{ borderRadius: CARD_BORDER_RADIUS }}>
        {children}
      </div>
    </div>
  );
}

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
                ref={(node) => {
                  // Cover cached/instant-load images where the browser fires
                  // load before React attaches the onLoad listener.
                  if (node?.complete && node.naturalWidth > 0) {
                    onImgLoad();
                  }
                }}
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
              ref={(node) => {
                // Cover cached/instant-load images where the browser fires
                // load before React attaches the onLoad listener.
                if (node?.complete && node.naturalWidth > 0) {
                  onImgLoad();
                }
              }}
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
  /** Content rendered below the meta-label row (e.g. marker chips on /promos). */
  belowLabel?: ReactNode;
}

// Wrapper that owns the dnd-kit useDraggable subscription. Only mounted when a
// caller passes dragData (deckbuilder), so the cards browser and collection grid
// pay zero @dnd-kit cost on mount.
function DraggableTopSlotWrapper({
  dragId,
  dragData,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  dragId: string;
  dragData: Record<string, unknown>;
  className: string;
  style: CSSProperties | undefined;
  onMouseEnter: (() => void) | undefined;
  onMouseLeave: (() => void) | undefined;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !isMobile;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dragId,
    data: dragData,
    disabled: !enableDrag,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isDragging && "opacity-40", enableDrag && "select-none")}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...(enableDrag ? { ...listeners, ...attributes } : {})}
    >
      {children}
    </div>
  );
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
  belowLabel,
}: CardThumbnailProps) {
  const card = {
    ...printing.card,
    name: printing.printedName ?? printing.card.name,
    rulesText: printing.printedRulesText,
    effectText: printing.printedEffectText,
    flavorText: printing.flavorText,
  };
  const domainColors = useDomainColors();
  const frontImage = printing.images[0] ?? null;
  // Read `printing.card.type` directly (not `card.type`): reading the derived
  // `card` object here would couple its construction to this call and prevent
  // React Compiler from memoizing `card`. That unmemoized `card` would then
  // cascade into re-creating the `<CardImageContent>` JSX on every render.
  const orientation = getOrientation(printing.card.type);
  const thumbnailUrl = showImages && frontImage ? frontImage.thumbnail : null;
  // Two on-disk variants (400w + full) — let the browser pick when grid rows
  // are scaled large.
  const srcSet =
    showImages && frontImage ? `${frontImage.thumbnail} 400w, ${frontImage.full} 800w` : undefined;
  const rotated = needsCssRotation(orientation);
  // Priority images are LCP candidates the SSR shell already painted via
  // <FirstRowPreview>'s real <img> tags, so the browser has them cached.
  // Skip the opacity-0 → opacity-100 fade for these; otherwise the first
  // paint after hydration shows them at opacity-0 (over bg-muted/40) for a
  // frame before onLoad fires, producing a flash-and-fade on hydration.
  const [imgLoaded, setImgLoaded] = useState(priority ?? false);

  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  // Foil is preference-driven, so SSR can't know the user's setting. Defer
  // rendering the overlay until after hydration to avoid flashing foil on a
  // user who has disabled it while the client catches up.
  const hydrated = useHydrated();
  const gridFoil = foilEffect && hydrated;
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";
  const prices = usePrices();
  const favoritePrice = prices.get(printing.id, favoriteMarketplace);
  const compactFmt = compactFormatterForMarketplace(favoriteMarketplace);
  const isFoilCard = printing.finish === WellKnown.finish.FOIL;
  const { labels } = useEnumOrders();
  const finishTitle = labels.finishes[printing.finish] ?? printing.finish;
  const tiltEnabled = cardTilt && !IS_COARSE_POINTER;
  // Pick a shell: TiltImageShell calls useCardTilt internally, PlainImageShell
  // skips the hook entirely. Toggling cardTilt remounts the shell (and all
  // visible cards) once — cheap relative to paying for unused hook bookkeeping
  // on every disabled-state render. The plain path also drops TILT_STYLE so
  // cards stay on the 2D paint path during scroll.
  const ImageShell = tiltEnabled ? TiltImageShell : PlainImageShell;
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== printing.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = fancyFan ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // custom: dim the whole card in the deckbuilder so banned cards read as unavailable
  const banDim = showBanOverlay && printing.card.bans.length > 0 && (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-black/70" />
  );

  // Riot TCG community license requires previewed/unreleased cards to be
  // clearly labeled. The ribbon is anchored to the image rectangle so it
  // stays visible in every context a printing is rendered. Anchored top-right
  // so it doesn't cover the power pips in the top-left of the card art.
  const previewOverlay = !printing.setReleased && (
    <div
      className="@container pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
      title="Previewed / Unreleased — not yet available in official play"
    >
      <div className="absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] bg-amber-500 py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider text-amber-950 uppercase shadow-md select-none">
        Preview
      </div>
    </div>
  );

  // Banned ribbon mirrors the Preview ribbon (top-right) and sits above it at z-40
  // so the rare previewed-and-banned card still reads as banned.
  const banRibbon = printing.card.bans.length > 0 && (
    <div
      className="@container pointer-events-none absolute inset-0 z-40 overflow-hidden rounded-[inherit]"
      title="Banned in the current format"
    >
      <div className="absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] bg-red-600 py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider text-red-50 uppercase shadow-md select-none">
        Banned
      </div>
    </div>
  );

  const imageSection = (
    <div
      className={cn(
        "relative",
        otherPrintings.length > 0 && "group-hover:z-20",
        dimmed && "opacity-50",
      )}
    >
      {otherPrintings.map((sibling, i) => {
        const depth = otherPrintings.length - i;
        const siblingThumbnail = sibling.images[0]?.thumbnail ?? null;
        const siblingUrl = fancyFan && showImages ? siblingThumbnail : null;
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
            <FinishIcon
              finish={sibling.finish}
              className="absolute top-1.5 right-1.5 z-20 drop-shadow"
              iconClassName="size-4"
            />
          </div>
        );
      })}
      <ImageShell>
        <div className="relative overflow-hidden" style={{ borderRadius: "inherit" }}>
          <CardImageContent
            thumbnailUrl={thumbnailUrl}
            srcSet={srcSet}
            sizes={cardWidth ? `${Math.round(cardWidth - 12)}px` : undefined}
            alt={card.name}
            priority={Boolean(priority)}
            imgLoaded={imgLoaded}
            onImgLoad={() => setImgLoaded(true)}
            rotated={rotated}
            rarity={printing.rarity}
            publicCode={printing.publicCode}
            artist={printing.artist}
            card={card}
            showFoil={isFoilCard && gridFoil}
          />
        </div>
        {banDim}
        {previewOverlay}
        {banRibbon}
      </ImageShell>
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
        finish={printing.finish}
        finishTitle={finishTitle}
        bans={showBanOverlay ? undefined : printing.card.bans}
        hasRulesDeviation={printing.card.errata !== null}
        printingComment={printing.comment}
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

  /* ── Top-slot mode: outer <div> is inert, only the image area is a <button> ── */
  if (topSlot) {
    const wrapperClassName = cn(
      // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
      "group relative z-0 w-full rounded-lg p-1.5 text-left transition-all hover:z-10",
      otherPrintings.length > 0 && "hover:[--fan:1]",
    );
    const wrapperStyle =
      isSelected || highlighted
        ? getDomainGradientStyle(card.domains, "38", domainColors)
        : undefined;
    const wrapperContent = (
      <>
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
        {belowLabel}
      </>
    );

    if (dragData) {
      return (
        <DraggableTopSlotWrapper
          dragId={dragId ?? `card-${printing.id}`}
          dragData={dragData}
          className={wrapperClassName}
          style={wrapperStyle}
          onMouseEnter={fanMouseEnter}
          onMouseLeave={fanMouseLeave}
        >
          {wrapperContent}
        </DraggableTopSlotWrapper>
      );
    }

    return (
      <div
        className={wrapperClassName}
        style={wrapperStyle}
        onMouseEnter={fanMouseEnter}
        onMouseLeave={fanMouseLeave}
      >
        {wrapperContent}
      </div>
    );
  }

  /* ── Normal mode: only the image area is clickable ── */
  return (
    <div
      className={cn(
        // ⚠ p-1.5 is mirrored as BUTTON_PAD in card-grid.tsx — update both together
        "group relative z-0 w-full rounded-lg p-1.5 text-left transition-all hover:z-10",
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
      {belowLabel}
    </div>
  );
});
