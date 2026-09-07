import { useDraggable } from "@dnd-kit/core";
import { imageUrl } from "@openrift/shared/image-url";
import type { StandardArtFallback } from "@openrift/shared/standard";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Domain, Rarity } from "@openrift/shared/types/enums";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown, isBaseBanFormat } from "@openrift/shared/well-known";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";

import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FallbackArtBadges } from "@/components/cards/fallback-art-badges";
import { FinishIcon } from "@/components/cards/finish-icon";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { SuggestImageNotice } from "@/components/cards/suggest-image-notice";
import { Pressable } from "@/components/ui/pressable";
import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import { getDomainGradientStyle } from "@/lib/domain";
import { priceColorClass } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";

const CARD_WIDTH = 630;
const CARD_HEIGHT = 880;

const PROMO_MARKER_SLUG = "promo";

function promoMarkerLabel(printing: Printing): string | undefined {
  return printing.markers.find((m) => m.slug === PROMO_MARKER_SLUG)?.label;
}

function cardSrcSet(imageId: string): string {
  return `${imageUrl(imageId, "120w")} 120w, ${imageUrl(imageId, "240w")} 240w, ${imageUrl(imageId, "400w")} 400w, ${imageUrl(imageId, "full")} 800w`;
}

const TILT_STYLE = {
  transform:
    "perspective(800px) rotateX(var(--foil-rotate-x, 0deg)) rotateY(var(--foil-rotate-y, 0deg))",
  transformStyle: "preserve-3d",
} as const;

export const AFTER_BORDER =
  "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:border after:border-[var(--border-opaque)]";

const SHELL_INNER_CLASS = cn("relative", AFTER_BORDER, "hover:ring-primary/60 hover:ring-2");

const MAX_CLOSED_STACK_EDGES = 5;

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

function PlainImageShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className={SHELL_INNER_CLASS} style={{ borderRadius: CARD_BORDER_RADIUS }}>
        {children}
      </div>
    </div>
  );
}

// Caller keeps overflow-hidden and the preserve-3d transform on separate elements
// around this, or Firefox mis-sizes the rotated-image overlay on stacked layers.
// data-loaded is written directly by the load handler, not React state, so a
// filter swap of ~25 images doesn't re-render each cell; key={thumbnailUrl} resets it.
const FADE_IN_CLASS = "opacity-0 transition-opacity duration-300 data-[loaded]:opacity-100";

function markLoaded(node: HTMLImageElement): void {
  node.dataset.loaded = "";
}

function CardArtImage({
  thumbnailUrl,
  srcSet,
  sizes,
  alt,
  rotated,
  loading,
  fetchPriority,
  fade,
  onError,
  spacerClassName,
}: {
  thumbnailUrl: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  rotated: boolean;
  loading: "eager" | "lazy";
  fetchPriority?: "high";
  /** Off for priority images: they're already SSR-painted, so a transparent start flashes on hydration. */
  fade?: boolean;
  onError?: () => void;
  spacerClassName?: string;
}) {
  // Covers cached/instant results: the browser can fire load/error before React
  // attaches listeners. A broken image has `complete` set with naturalWidth 0.
  const coverCachedResult = (node: HTMLImageElement | null) => {
    if (node?.complete) {
      if (node.naturalWidth > 0) {
        markLoaded(node);
      } else {
        onError?.();
      }
    }
  };
  const imgClass = fade ? FADE_IN_CLASS : undefined;
  return (
    <>
      <div className={cn("aspect-card", spacerClassName)} />
      {rotated ? (
        <div className="absolute top-1/2 left-1/2 overflow-hidden" style={LANDSCAPE_ROTATION_STYLE}>
          <img
            key={thumbnailUrl}
            ref={coverCachedResult}
            src={thumbnailUrl}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            width={CARD_HEIGHT}
            height={CARD_WIDTH}
            loading={loading}
            fetchPriority={fetchPriority}
            className={cn("size-full object-cover", imgClass)}
            onLoad={(event) => markLoaded(event.currentTarget)}
            onError={onError}
          />
        </div>
      ) : (
        <img
          key={thumbnailUrl}
          ref={coverCachedResult}
          src={thumbnailUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          loading={loading}
          fetchPriority={fetchPriority}
          className={cn("absolute inset-0 w-full object-cover", imgClass)}
          onLoad={(event) => markLoaded(event.currentTarget)}
          onError={onError}
        />
      )}
    </>
  );
}

function CardImageContent({
  thumbnailUrl,
  srcSet,
  sizes,
  alt,
  priority,
  rotated,
  rarity,
  publicCode,
  artist,
  promoLabel,
  card,
  showFoil,
  fallbackArt,
  spacerClassName,
}: {
  thumbnailUrl: string | null;
  srcSet: string | undefined;
  sizes: string | undefined;
  alt: string;
  priority: boolean;
  rotated: boolean;
  rarity: Rarity;
  publicCode: string;
  artist: string;
  promoLabel: string | undefined;
  card: {
    name: string;
    domains: Domain[];
    energy: number | null;
    might?: number | null;
    power?: number | null;
    types?: string[];
    superTypes?: string[];
    tags?: string[];
    rulesText?: string | null;
    effectText?: string | null;
    mightBonus?: number | null;
    flavorText?: string | null;
  };
  showFoil: boolean;
  /** Substitute artwork tried before the drawn placeholder; overlay marks what the borrowed art doesn't depict. */
  fallbackArt: { imageId: string; overlay: ReactNode } | null;
  spacerClassName: string;
}) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const markFailed = (url: string) =>
    setFailedUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
  const artUrl = thumbnailUrl !== null && !failedUrls.includes(thumbnailUrl) ? thumbnailUrl : null;
  const fallbackCandidate =
    fallbackArt === null ? null : { ...fallbackArt, url: imageUrl(fallbackArt.imageId, "400w") };
  const shownFallback =
    artUrl === null && fallbackCandidate !== null && !failedUrls.includes(fallbackCandidate.url)
      ? fallbackCandidate
      : null;
  const drawnPlaceholder = (
    <CardPlaceholderImage
      name={card.name}
      domain={card.domains}
      energy={card.energy}
      might={card.might}
      power={card.power}
      types={card.types}
      superTypes={card.superTypes}
      tags={card.tags}
      rulesText={card.rulesText}
      effectText={card.effectText}
      mightBonus={card.mightBonus}
      flavorText={card.flavorText}
      rarity={rarity}
      publicCode={publicCode}
      artist={artist}
      promoLabel={promoLabel}
    />
  );
  // Empty alt marks decorative sibling faces, so the placeholder's role="img" label
  // doesn't pollute the accessible name of the parent button they sit inside.
  const placeholder =
    alt === "" ? <div aria-hidden="true">{drawnPlaceholder}</div> : drawnPlaceholder;
  return (
    <>
      {artUrl ? (
        <CardArtImage
          thumbnailUrl={artUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          rotated={rotated}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          fade={!priority}
          onError={() => markFailed(artUrl)}
          spacerClassName={spacerClassName}
        />
      ) : shownFallback ? (
        <>
          <CardArtImage
            thumbnailUrl={shownFallback.url}
            srcSet={cardSrcSet(shownFallback.imageId)}
            sizes={sizes}
            alt={alt}
            rotated={rotated}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            fade={!priority}
            onError={() => markFailed(shownFallback.url)}
            spacerClassName={spacerClassName}
          />
          {shownFallback.overlay}
        </>
      ) : (
        placeholder
      )}
      {showFoil && <FoilOverlay active />}
    </>
  );
}

function displayCard(printing: Printing) {
  return {
    ...printing.card,
    name: printing.printedName ?? legendDisplayName(printing.card),
    rulesText: printing.printedRulesText,
    effectText: printing.printedEffectText,
    flavorText: printing.flavorText,
  };
}

function fallbackArtStep(printing: Printing, fallback: StandardArtFallback | null) {
  if (fallback === null) {
    return null;
  }
  return {
    imageId: fallback.image.imageId,
    overlay: <FallbackArtBadges printing={printing} artPrinting={fallback.printing} />,
  };
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
  /** Ignored when `cardWidth` is provided; the pixel-precise value wins. */
  sizes?: string;
  priority?: boolean;
  display: CardThumbnailDisplay;
  aboveCard?: ReactNode;
  dimmed?: boolean;
  highlighted?: boolean;
  dragData?: Record<string, unknown>;
  /** Required when dragData is set. */
  dragId?: string;
  showBanOverlay?: boolean;
  hideBanIndicators?: boolean;
  belowLabel?: ReactNode;
  imageOverlay?: ReactNode;
}

// Only mounted when dragData is passed, so callers without drag pay zero @dnd-kit cost.
function DraggableTileWrapper({
  dragId,
  dragData,
  className,
  onMouseEnter,
  onMouseLeave,
  printingId,
  children,
}: {
  dragId: string;
  dragData: Record<string, unknown>;
  className: string;
  onMouseEnter: (() => void) | undefined;
  onMouseLeave: (() => void) | undefined;
  printingId: string;
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
      data-printing-id={printingId}
      className={cn(className, isDragging && "opacity-40", enableDrag && "select-none")}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...(enableDrag ? { ...listeners, ...attributes } : {})}
    >
      {children}
    </div>
  );
}

// React Compiler cannot memoize JSX created inside the virtualizer's items.map() callback.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
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
  sizes: sizesOverride,
  priority,
  display,
  aboveCard,
  dimmed,
  highlighted,
  dragData,
  dragId,
  showBanOverlay,
  hideBanIndicators,
  belowLabel,
  imageOverlay,
}: CardThumbnailProps) {
  const card = displayCard(printing);
  const frontImage = printing.images[0] ?? null;
  // Reads printing.card.type directly, not card.type: coupling this to the derived
  // `card` object would block React Compiler from memoizing it and its JSX.
  const orientation = getOrientation(printing.card.types);
  const thumbnailUrl = showImages && frontImage ? imageUrl(frontImage.imageId, "400w") : null;
  const srcSet = showImages && frontImage ? cardSrcSet(frontImage.imageId) : undefined;
  const fallbackArt = fallbackArtStep(
    printing,
    showImages ? display.getFallbackArt(printing) : null,
  );
  const rotated = needsCssRotation(orientation);

  const {
    fancyFan,
    gridFoil,
    cardTilt,
    coarsePointer,
    domainColors,
    finishLabels,
    sizeLabels,
    rarityLabels,
    prices,
    favoriteMarketplace,
  } = display;
  const favoritePrice = prices.get(printing.id, favoriteMarketplace);
  const isFoilCard = printing.finish === WellKnown.finish.FOIL;
  const finishTitle = finishLabels[printing.finish] ?? printing.finish;
  const rarityTitle = rarityLabels[printing.rarity] ?? printing.rarity;
  const isOversized = printing.size !== WellKnown.cardSize.STANDARD;
  const sizeLabel = sizeLabels[printing.size] ?? printing.size;
  const tiltEnabled = cardTilt && !coarsePointer;
  const ImageShell = tiltEnabled ? TiltImageShell : PlainImageShell;
  const otherPrintings = siblings ? siblings.filter((s) => s.id !== printing.id).toReversed() : [];
  const fanStep = cardWidth === undefined ? 2 : Math.max(1, cardWidth * 0.01);
  const fanAngle = fancyFan ? 8 : 1.5;
  const [fanReady, setFanReady] = useState(false);
  // Latches true on first hover and never resets, so re-entering doesn't remount sibling faces.
  const [fanHovered, setFanHovered] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);
  // Unmounting mid-hover (before the 200ms fan timer fires) would setState on a gone component.
  useEffect(
    () => () => {
      if (fanTimer.current) {
        clearTimeout(fanTimer.current);
      }
    },
    [],
  );

  // Base-list bans apply to all constructed play; mode-scoped bans (e.g. 2v2-only)
  // leave the card legal elsewhere, so only base bans get the full "unusable" treatment.
  const activeBans = hideBanIndicators ? [] : printing.card.bans;
  const baseBans = activeBans.filter((ban) => isBaseBanFormat(ban.formatId));
  const modeBans = activeBans.filter((ban) => !isBaseBanFormat(ban.formatId));

  const banDim = showBanOverlay && baseBans.length > 0 && (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-black/70" />
  );

  // Riot TCG community license requires previewed/unreleased cards to be labeled;
  // `setReleased` is per printing language, covering a set out elsewhere but not here.
  const previewOverlay = !printing.setReleased && (
    <div
      className="@container pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-[inherit]"
      title="Not released in this language yet"
    >
      <div className="bg-warning text-warning-foreground absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider uppercase shadow-md select-none">
        Preview
      </div>
    </div>
  );

  // z-40, above the z-30 Preview ribbon: a previewed-and-banned card stays visibly banned.
  const soleModeBan = baseBans.length === 0 && modeBans.length === 1 ? modeBans[0] : undefined;
  const banLines = activeBans.map((ban) => `Banned in ${ban.formatName} since ${ban.bannedAt}`);
  const banRibbon = activeBans.length > 0 && (
    <div
      className="@container pointer-events-none absolute inset-0 z-40 overflow-hidden rounded-[inherit]"
      title={
        baseBans.length > 0
          ? banLines.join("\n")
          : [...banLines, "Legal in other constructed play."].join("\n")
      }
    >
      <div className="bg-destructive absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider text-white uppercase shadow-md select-none">
        {soleModeBan ? `${soleModeBan.formatName} Ban` : "Banned"}
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
        const hiddenWhenClosed = depth > MAX_CLOSED_STACK_EDGES;
        const closedDepth = Math.min(depth, MAX_CLOSED_STACK_EDGES);
        // Defers the image download and placeholder DOM until first hover, and skips
        // them on coarse-pointer devices, where the fan never opens.
        const showSiblingFaces = fancyFan && !coarsePointer && fanHovered;
        const siblingImageId = showImages ? (sibling.images[0]?.imageId ?? null) : null;
        const siblingSizes = cardWidth ? `${Math.round(cardWidth - 12)}px` : sizesOverride;
        return (
          // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative layer inside a parent <button>; keyboard nav handled by parent
          <div
            key={sibling.id}
            className={cn(
              "pointer-events-none absolute inset-0",
              fanReady && "pointer-events-auto cursor-pointer",
            )}
            onClick={(e) => {
              e.stopPropagation();
              (onSiblingClick ?? onClick)(sibling);
            }}
          >
            {/* preserve-3d must sit on this element and overflow-hidden on a separate
                child below, or Firefox mis-sizes and clips the rotated overlay. */}
            <div
              className={cn(SHELL_INNER_CLASS, "origin-bottom")}
              style={{
                borderRadius: CARD_BORDER_RADIUS,
                transformStyle: "preserve-3d",
                translate: `calc((1 - var(--fan, 0)) * ${closedDepth * fanStep}px) calc((1 - var(--fan, 0)) * ${closedDepth * fanStep}px)`,
                rotate: `calc(var(--fan, 0) * ${depth * fanAngle}deg)`,
                opacity: hiddenWhenClosed ? "var(--fan, 0)" : undefined,
                transition:
                  "rotate 200ms ease-out, translate 200ms ease-out, scale 150ms ease-out, opacity 200ms ease-out",
              }}
            >
              <div className="relative overflow-hidden" style={{ borderRadius: "inherit" }}>
                {showSiblingFaces ? (
                  <CardImageContent
                    thumbnailUrl={siblingImageId === null ? null : imageUrl(siblingImageId, "400w")}
                    srcSet={siblingImageId === null ? undefined : cardSrcSet(siblingImageId)}
                    sizes={siblingSizes}
                    alt=""
                    priority={false}
                    rotated={rotated}
                    rarity={sibling.rarity}
                    publicCode={sibling.publicCode}
                    artist={sibling.artist}
                    promoLabel={promoMarkerLabel(sibling)}
                    card={displayCard(sibling)}
                    showFoil={false}
                    fallbackArt={fallbackArtStep(
                      sibling,
                      showImages ? display.getFallbackArt(sibling) : null,
                    )}
                    spacerClassName="bg-black"
                  />
                ) : (
                  <div className="aspect-card bg-black" />
                )}
                {showSiblingFaces && (
                  // z-[1]: above the face, below the ::after border (z-10) and finish icon (z-20).
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[1] bg-black"
                    style={{
                      opacity: "calc(1 - var(--fan, 0))",
                      transition: "opacity 200ms ease-out",
                    }}
                  />
                )}
                {sibling.finish === WellKnown.finish.FOIL && gridFoil && <FoilOverlay active dim />}
                <FinishIcon
                  finish={sibling.finish}
                  className="absolute top-1.5 right-1.5 z-20 drop-shadow"
                  iconClassName="size-4"
                />
              </div>
            </div>
          </div>
        );
      })}
      <ImageShell>
        <div className="relative overflow-hidden" style={{ borderRadius: "inherit" }}>
          <CardImageContent
            thumbnailUrl={thumbnailUrl}
            srcSet={srcSet}
            sizes={cardWidth ? `${Math.round(cardWidth - 12)}px` : sizesOverride}
            alt={card.name}
            priority={Boolean(priority)}
            rotated={rotated}
            rarity={printing.rarity}
            publicCode={printing.publicCode}
            artist={printing.artist}
            promoLabel={promoMarkerLabel(printing)}
            card={card}
            showFoil={isFoilCard && gridFoil}
            fallbackArt={fallbackArt}
            spacerClassName="bg-muted"
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
      <>
        {/* Below 12rem (phone 2-column grid) the full range leaves the name ~10 characters. */}
        <span className={cn("shrink-0 @[12rem]:hidden", priceColorClass(priceRange.min))}>
          {display.compactFmt(priceRange.min)}+
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 @[12rem]:flex">
          <span className={priceColorClass(priceRange.min)}>
            {display.compactFmt(priceRange.min)}
          </span>
          <span className="text-muted-foreground/60">&ndash;</span>
          <span className={priceColorClass(priceRange.max)}>
            {display.compactFmt(priceRange.max)}
          </span>
        </span>
      </>
    ) : (
      <span className={cn("shrink-0", priceColorClass(favoritePrice))}>
        {display.compactFmt(favoritePrice)}
      </span>
    );

  const labelSection = (
    // ⚠ mt-2.5 is mirrored as LABEL_WRAPPER_MT in card-grid.tsx — update both together
    <div className="relative z-10 mt-2.5">
      <CardMetaLabel
        shortCode={printing.shortCode}
        name={card.name}
        rarity={printing.rarity}
        rarityTitle={rarityTitle}
        finish={printing.finish}
        finishTitle={finishTitle}
        oversized={isOversized}
        sizeLabel={sizeLabel}
        bans={showBanOverlay || hideBanIndicators ? undefined : printing.card.bans}
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
          // Mounted immediately so images are requested before the 200ms fan-open
          // transition reveals anything behind the front card.
          setFanHovered(true);
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

  // Only the image area is Pressable, so interactive `aboveCard` strips don't nest in a button.
  const selected = isSelected === true || highlighted === true;
  // Must be a separate layer with negative inset: the wrapper's background
  // would confine the glow to the cell padding instead.
  const selectionGlow = selected && (
    <div
      className="pointer-events-none absolute -inset-2 -z-10 rounded-2xl blur-sm"
      style={getDomainGradientStyle(card.domains, "50", domainColors)}
    />
  );
  const wrapperClassName = cn(
    // ⚠ p-0.75 is mirrored as BUTTON_PAD in card-grid-constants.ts — update both together
    "group relative z-0 w-full rounded-lg p-0.75 text-left transition-all hover:z-10",
    otherPrintings.length > 0 && "hover:[--fan:1]",
    // Without this, equal-z siblings paint in DOM order: the glow shows over the
    // left neighbour but under the right one.
    selected && "z-10",
  );
  const wrapperContent = (
    <>
      {selectionGlow}
      {flashOverlay}
      {aboveCard}
      <div className="relative">
        <Pressable className="block w-full" onClick={(e) => onClick(printing, e)}>
          {imageSection}
        </Pressable>
        {imageOverlay}
        {/* Sibling of the image (not inside it) so the unowned opacity-50 dim
            on imageSection never greys the notice out. */}
        <SuggestImageNotice printing={printing} />
      </div>
      {labelSection}
      {belowLabel}
    </>
  );

  if (dragData) {
    return (
      <DraggableTileWrapper
        dragId={dragId ?? `card-${printing.id}`}
        dragData={dragData}
        className={wrapperClassName}
        onMouseEnter={fanMouseEnter}
        onMouseLeave={fanMouseLeave}
        printingId={printing.id}
      >
        {wrapperContent}
      </DraggableTileWrapper>
    );
  }

  return (
    <div
      data-printing-id={printing.id}
      className={wrapperClassName}
      onMouseEnter={fanMouseEnter}
      onMouseLeave={fanMouseLeave}
    >
      {wrapperContent}
    </div>
  );
});
