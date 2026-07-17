import { useDraggable } from "@dnd-kit/core";
import type { Domain, Marketplace, PriceLookup, Printing, Rarity } from "@openrift/shared";
import {
  WellKnown,
  getOrientation,
  imageUrl,
  isBaseBanFormat,
  legendDisplayName,
} from "@openrift/shared";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { memo, useEffect, useRef, useState } from "react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { CardMetaLabel } from "@/components/cards/card-meta-label";
import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { FinishIcon } from "@/components/cards/finish-icon";
import { FoilOverlay } from "@/components/cards/foil-overlay";
import { Pressable } from "@/components/ui/pressable";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePrices } from "@/hooks/use-prices";
import { getDomainGradientStyle } from "@/lib/domain";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import { LANDSCAPE_ROTATION_STYLE, needsCssRotation } from "@/lib/images";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export interface CardThumbnailDisplay {
  fancyFan: boolean;
  /** Pre-derived `foilEffect && hydrated` — foil is preference-driven so SSR can't know. */
  gridFoil: boolean;
  cardTilt: boolean;
  /**
   * Lifted result of {@link useCoarsePointer} so per-card render doesn't pay
   * an extra subscription each. The hook is SSR-safe; the value is `false`
   * during the initial client render to match SSR, then settles to the real
   * `(pointer: coarse)` state one paint later.
   */
  coarsePointer: boolean;
  domainColors: Record<string, string>;
  finishLabels: Record<string, string>;
  sizeLabels: Record<string, string>;
  prices: PriceLookup;
  favoriteMarketplace: Marketplace;
  compactFmt: (n: number) => string;
}

/**
 * Bundles every grid-invariant display read into one object. Each card grid
 * subscribes once at the parent and threads the result through its
 * `renderCard`, so the lifted reads do NOT run per card.
 *
 * Why this exists: <CardThumbnail> remounts continuously as the virtualizer
 * mounts/unmounts rows during scroll, on top of one row's worth of mounts
 * at hydration. Reading these inside the card meant ~8 store/hook
 * subscriptions per card — each with its own useSyncExternalStore effect
 * setup/teardown. Lifting them to one parent call cuts that to N
 * subscriptions for the whole grid instead of N × cards. Steady-state
 * re-render cost is unchanged (Zustand's strict-equality selectors already
 * skip re-renders when slices don't change); the win is mount-time effect
 * wiring during hydration and scroll.
 *
 * @returns The display context bundle a `CardThumbnail` consumer must pass.
 */
export function useCardThumbnailDisplay(): CardThumbnailDisplay {
  "use memo";
  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const hydrated = useHydrated();
  const coarsePointer = useCoarsePointer();
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const prices = usePrices();
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";
  return {
    fancyFan,
    gridFoil: foilEffect && hydrated,
    cardTilt,
    coarsePointer,
    domainColors,
    finishLabels: labels.finishes,
    sizeLabels: labels.cardSizes,
    prices,
    favoriteMarketplace,
    compactFmt: compactFormatterForMarketplace(favoriteMarketplace),
  };
}

/** Intrinsic dimensions matching the standard card aspect ratio (63×88mm). */
const CARD_WIDTH = 630;
const CARD_HEIGHT = 880;

/**
 * DB slug of the "Promo" marker (`markers.slug`). Placeholder art surfaces
 * only this marker's label — stamps like judge or prerelease stay off it.
 */
const PROMO_MARKER_SLUG = "promo";

/**
 * Picks the marker label placeholder art may show for a printing.
 * @returns The promo marker's label, or undefined when the printing isn't a promo.
 */
function promoMarkerLabel(printing: Printing): string | undefined {
  return printing.markers.find((m) => m.slug === PROMO_MARKER_SLUG)?.label;
}

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

/**
 * The spacer plus the (optionally landscape-rotated) card art image. Every
 * place a card image is painted renders this — the front of a stack and each
 * fanned sibling behind it — so the landscape-rotation geometry never drifts
 * between them. That drift is what made battlefields clip in Firefox on the
 * stacked layers. The caller still owns the `relative overflow-hidden` clip box
 * and the transformed `preserve-3d` shell around it; keep overflow-hidden and
 * the transform on separate elements, or Firefox mis-sizes this overlay.
 *
 * @returns The aspect-card spacer and the rotation-aware <img>.
 */
function CardArtImage({
  thumbnailUrl,
  srcSet,
  sizes,
  alt,
  rotated,
  loading,
  fetchPriority,
  onLoad,
  onError,
  loaded,
  spacerClassName,
}: {
  thumbnailUrl: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  rotated: boolean;
  loading: "eager" | "lazy";
  fetchPriority?: "high";
  /** When provided, fades the image in on load and covers cached/instant loads. */
  onLoad?: () => void;
  /** Invoked when the image fails to load (missing on the server, network error). */
  onError?: () => void;
  /** Current loaded state driving the fade-in; only meaningful alongside onLoad. */
  loaded?: boolean;
  /** Tint for the spacer behind the art (e.g. `bg-muted/40` front, `bg-muted` behind). */
  spacerClassName?: string;
}) {
  // Cover cached/instant results where the browser fires load or error before
  // React attaches the listeners. A broken image has `complete` set with
  // naturalWidth 0.
  const coverCachedResult =
    onLoad || onError
      ? (node: HTMLImageElement | null) => {
          if (node?.complete) {
            if (node.naturalWidth > 0) {
              onLoad?.();
            } else {
              onError?.();
            }
          }
        }
      : undefined;
  const fadeClass = onLoad
    ? cn("transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")
    : undefined;
  return (
    <>
      <div className={cn("aspect-card", spacerClassName)} />
      {rotated ? (
        <div
          className={cn("absolute top-1/2 left-1/2 overflow-hidden", fadeClass)}
          style={LANDSCAPE_ROTATION_STYLE}
        >
          <img
            ref={coverCachedResult}
            src={thumbnailUrl}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            width={CARD_HEIGHT}
            height={CARD_WIDTH}
            loading={loading}
            fetchPriority={fetchPriority}
            className="size-full object-cover"
            onLoad={onLoad}
            onError={onError}
          />
        </div>
      ) : (
        <img
          ref={coverCachedResult}
          src={thumbnailUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          loading={loading}
          fetchPriority={fetchPriority}
          className={cn("absolute inset-0 w-full object-cover", fadeClass)}
          onLoad={onLoad}
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
  imgLoaded,
  onImgLoad,
  rotated,
  rarity,
  publicCode,
  artist,
  promoLabel,
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
}) {
  // A failed load (missing on the server, network error) falls back to the
  // placeholder below. Keyed by URL so a changed image on a reused instance
  // gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const artUrl = thumbnailUrl === failedUrl ? null : thumbnailUrl;
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
          onLoad={onImgLoad}
          onError={() => setFailedUrl(artUrl)}
          loaded={imgLoaded}
          spacerClassName="bg-muted/40"
        />
      ) : (
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
      )}
      {showFoil && <FoilOverlay active />}
    </>
  );
}

// Renders a fanned sibling's art, swapping to the given placeholder when the
// image fails to load (missing on the server, network error). Owns the failure
// state so one broken sibling doesn't re-render the whole thumbnail.
function SiblingArt({
  src,
  srcSet,
  sizes,
  rotated,
  fallback,
}: {
  src: string;
  srcSet: string | undefined;
  sizes: string | undefined;
  rotated: boolean;
  fallback: ReactNode;
}) {
  // Keyed by URL so a changed image on a reused instance gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src === failedSrc) {
    return fallback;
  }
  return (
    <CardArtImage
      thumbnailUrl={src}
      srcSet={srcSet}
      sizes={sizes}
      alt=""
      rotated={rotated}
      loading="lazy"
      spacerClassName="bg-black"
      onError={() => setFailedSrc(src)}
    />
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
  /**
   * Static `sizes` attribute for non-virtualized callers (e.g. /sets/[slug],
   * /promos) that don't have a measured per-cell pixel width. Ignored when
   * `cardWidth` is provided — the pixel-precise value wins.
   */
  sizes?: string;
  priority?: boolean;
  /**
   * Grid-invariant display reads (preferences, prices, enum labels). Each
   * caller obtains this once per render via {@link useCardThumbnailDisplay}
   * and passes the same reference to every card in the grid. See that hook
   * for the rationale.
   */
  display: CardThumbnailDisplay;
  /** Content rendered above the card image (count strip, add strip, …). */
  aboveCard?: ReactNode;
  /** Dims the card image (used in add mode for unowned cards). */
  dimmed?: boolean;
  /** Applies domain gradient background (used for "in deck" highlight). */
  highlighted?: boolean; // custom: deckbuilder highlights cards already in the deck
  /** When provided, makes the card draggable with this data (used by deckbuilder). */
  dragData?: Record<string, unknown>; // custom: passed to @dnd-kit useDraggable
  /** Unique drag ID (required when dragData is set). */
  dragId?: string; // custom: @dnd-kit draggable ID
  /** Shows a large diagonal "BANNED" overlay on the card image. */
  showBanOverlay?: boolean; // custom: deckbuilder banned card overlay
  /** Hides every ban indicator (ribbon, dim, meta chip) — for formats without a ban list. */
  hideBanIndicators?: boolean; // custom: custom-region deckbuilder ignores bans
  /** Content rendered below the meta-label row (e.g. marker chips on /promos). */
  belowLabel?: ReactNode;
  /**
   * Content overlaid on the card image area. Positioned as a sibling of the
   * image button so it aligns with the placeholder/image rectangle even when
   * `aboveCard` is present.
   */
  imageOverlay?: ReactNode;
}

// Wrapper that owns the dnd-kit useDraggable subscription. Only mounted when a
// caller passes dragData (deckbuilder), so the cards browser and collection grid
// pay zero @dnd-kit cost on mount.
function DraggableTileWrapper({
  dragId,
  dragData,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  printingId,
  children,
}: {
  dragId: string;
  dragData: Record<string, unknown>;
  className: string;
  style: CSSProperties | undefined;
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
  const card = {
    ...printing.card,
    name: printing.printedName ?? printing.card.name,
    rulesText: printing.printedRulesText,
    effectText: printing.printedEffectText,
    flavorText: printing.flavorText,
  };
  // Legends read as "Azir, Emperor of the Sands" — the champion tag is prepended
  // for display only (read printing.card.types/tags directly so `card` stays
  // memoizable, mirroring the orientation note below).
  const displayName = legendDisplayName({
    name: card.name,
    types: printing.card.types,
    tags: printing.card.tags,
  });
  const frontImage = printing.images[0] ?? null;
  // Read `printing.card.type` directly (not `card.type`): reading the derived
  // `card` object here would couple its construction to this call and prevent
  // React Compiler from memoizing `card`. That unmemoized `card` would then
  // cascade into re-creating the `<CardImageContent>` JSX on every render.
  const orientation = getOrientation(printing.card.types);
  const thumbnailUrl = showImages && frontImage ? imageUrl(frontImage.imageId, "400w") : null;
  // Full ladder so the browser can pick a smaller variant for tight cells
  // (DPR-1 phones, dense desktop grids) without sacrificing sharpness on
  // larger ones.
  const srcSet =
    showImages && frontImage
      ? `${imageUrl(frontImage.imageId, "120w")} 120w, ${imageUrl(frontImage.imageId, "240w")} 240w, ${imageUrl(frontImage.imageId, "400w")} 400w, ${imageUrl(frontImage.imageId, "full")} 800w`
      : undefined;
  const rotated = needsCssRotation(orientation);
  // Priority images are LCP candidates the SSR shell already painted via
  // <FirstRowPreview>'s real <img> tags, so the browser has them cached.
  // Skip the opacity-0 → opacity-100 fade for these; otherwise the first
  // paint after hydration shows them at opacity-0 (over bg-muted/40) for a
  // frame before onLoad fires, producing a flash-and-fade on hydration.
  const [imgLoaded, setImgLoaded] = useState(priority ?? false);

  const {
    fancyFan,
    gridFoil,
    cardTilt,
    coarsePointer,
    domainColors,
    finishLabels,
    sizeLabels,
    prices,
    favoriteMarketplace,
  } = display;
  const favoritePrice = prices.get(printing.id, favoriteMarketplace);
  const isFoilCard = printing.finish === WellKnown.finish.FOIL;
  const finishTitle = finishLabels[printing.finish] ?? printing.finish;
  const isOversized = printing.size !== WellKnown.cardSize.STANDARD;
  const sizeLabel = sizeLabels[printing.size] ?? printing.size;
  const tiltEnabled = cardTilt && !coarsePointer;
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
  // Latches on first hover and never resets: sibling faces (image downloads
  // and placeholder DOM) mount lazily on hover and stay mounted, so leaving
  // and re-entering doesn't re-fetch or rebuild them.
  const [fanHovered, setFanHovered] = useState(false);
  const fanTimer = useRef<ReturnType<typeof setTimeout>>(null);
  // Only mouse-leave clears the timer, so unmounting mid-hover (before the
  // 200ms elapses) would leave it to fire and setState on a gone component.
  useEffect(
    () => () => {
      if (fanTimer.current) {
        clearTimeout(fanTimer.current);
      }
    },
    [],
  );

  // Banlists are additive per play mode: base-list bans apply to all
  // constructed play, mode-scoped bans (e.g. 2v2-only) leave the card legal
  // elsewhere, so only base bans get the full "unusable" treatment.
  const activeBans = hideBanIndicators ? [] : printing.card.bans;
  const baseBans = activeBans.filter((ban) => isBaseBanFormat(ban.formatId));
  const modeBans = activeBans.filter((ban) => !isBaseBanFormat(ban.formatId));

  // custom: dim the whole card in the deckbuilder so banned cards read as unavailable.
  // A deck has no play-mode identity, so mode-scoped bans don't dim.
  const banDim = showBanOverlay && baseBans.length > 0 && (
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
  // so the rare previewed-and-banned card still reads as banned. A base-list ban
  // reads "Banned"; a single mode-scoped ban is labeled with its mode ("2v2 Ban").
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
      <div className="absolute top-[18cqi] -right-[22cqi] w-[90cqi] rotate-[45deg] bg-red-600 py-[1.5cqi] text-center text-[6cqi] font-black tracking-wider text-red-50 uppercase shadow-md select-none">
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
        // Sibling faces are invisible until the hover fan-out — closed, only
        // the stacked edges peek out behind the front card. Defer the image
        // download and the placeholder DOM until the first hover, and skip
        // them entirely on coarse-pointer devices, where the fan never opens.
        // Until then a black stand-in card renders the edges.
        const showSiblingFaces = fancyFan && !coarsePointer && fanHovered;
        const siblingImageId =
          showSiblingFaces && showImages ? (sibling.images[0]?.imageId ?? null) : null;
        const siblingSrc = siblingImageId === null ? null : imageUrl(siblingImageId, "400w");
        const siblingSrcSet =
          siblingImageId === null
            ? undefined
            : `${imageUrl(siblingImageId, "120w")} 120w, ${imageUrl(siblingImageId, "240w")} 240w, ${imageUrl(siblingImageId, "400w")} 400w, ${imageUrl(siblingImageId, "full")} 800w`;
        const siblingSizes = cardWidth ? `${Math.round(cardWidth - 12)}px` : sizesOverride;
        // Imageless (and failed-image) printings get the same placeholder art
        // the front card uses, so the fan doesn't open onto bare gray
        // rectangles. aria-hidden: the stack sits inside the front card's
        // button, and the placeholder's role="img" label would pollute the
        // button's accessible name.
        const siblingPlaceholder = showSiblingFaces ? (
          <div aria-hidden="true">
            <CardPlaceholderImage
              name={sibling.printedName ?? sibling.card.name}
              domain={sibling.card.domains}
              energy={sibling.card.energy}
              might={sibling.card.might}
              power={sibling.card.power}
              types={sibling.card.types}
              superTypes={sibling.card.superTypes}
              tags={sibling.card.tags}
              rulesText={sibling.printedRulesText}
              effectText={sibling.printedEffectText}
              mightBonus={sibling.card.mightBonus}
              flavorText={sibling.flavorText}
              rarity={sibling.rarity}
              publicCode={sibling.publicCode}
              artist={sibling.artist}
              promoLabel={promoMarkerLabel(sibling)}
            />
          </div>
        ) : null;
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
            {/* Mirror the front card's Firefox-safe shell exactly: the fan
                transform + preserve-3d sit on this element (its own 3D layer),
                and overflow-hidden lives on a separate child below. Under a flat
                2D transform Firefox mis-sized the rotated battlefield overlay and
                clipped it with grey below; the front card avoided that only
                because cardTilt's preserve-3d shell gave it a real layer. */}
            <div
              className={cn(SHELL_INNER_CLASS, "origin-bottom")}
              style={{
                borderRadius: CARD_BORDER_RADIUS,
                transformStyle: "preserve-3d",
                translate: `calc((1 - var(--fan, 0)) * ${depth * fanStep}px) calc((1 - var(--fan, 0)) * ${depth * fanStep}px)`,
                rotate: `calc(var(--fan, 0) * ${depth * fanAngle}deg)`,
                transition: "rotate 200ms ease-out, translate 200ms ease-out, scale 150ms ease-out",
              }}
            >
              <div className="relative overflow-hidden" style={{ borderRadius: "inherit" }}>
                {siblingSrc ? (
                  <SiblingArt
                    src={siblingSrc}
                    srcSet={siblingSrcSet}
                    sizes={siblingSizes}
                    rotated={rotated}
                    fallback={siblingPlaceholder}
                  />
                ) : (
                  (siblingPlaceholder ?? <div className="aspect-card bg-black" />)
                )}
                {showSiblingFaces && (
                  // With the fan closed, re-cover the mounted face in black so
                  // a once-hovered stack looks identical to a never-hovered
                  // one. z-[1] keeps it above the face but below the ::after
                  // border (z-10) and the finish icon (z-20), which show on
                  // the closed stack either way.
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
            alt={displayName}
            priority={Boolean(priority)}
            imgLoaded={imgLoaded}
            onImgLoad={() => setImgLoaded(true)}
            rotated={rotated}
            rarity={printing.rarity}
            publicCode={printing.publicCode}
            artist={printing.artist}
            promoLabel={promoMarkerLabel(printing)}
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
      <>
        {/* On cells narrower than 12rem (phone 2-column grid) the full range
            leaves the name ~10 characters, so show just the "from" price. The
            container is the CardMetaLabel root. */}
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
        name={displayName}
        types={card.types}
        superTypes={card.superTypes}
        rarity={printing.rarity}
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
          // Mount the sibling faces immediately — the fan-open transition runs
          // 200ms, so placeholders are painted (and images requested) before
          // anything behind the front card becomes visible.
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

  // The outer wrapper is inert — only the image area is clickable, so
  // interactive `aboveCard` strips never nest inside a button.
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
      {aboveCard}
      <div className="relative">
        <Pressable className="block w-full" onClick={(e) => onClick(printing, e)}>
          {imageSection}
        </Pressable>
        {imageOverlay}
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
        style={wrapperStyle}
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
      style={wrapperStyle}
      onMouseEnter={fanMouseEnter}
      onMouseLeave={fanMouseLeave}
    >
      {wrapperContent}
    </div>
  );
});
