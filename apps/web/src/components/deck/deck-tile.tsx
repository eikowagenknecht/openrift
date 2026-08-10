import type { DeckListItemResponse, PrintingImage } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, PinIcon } from "lucide-react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useCustomTagList } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { getDomainGradientStyle } from "@/lib/domain";
import { resolveFormatTagSummary } from "@/lib/format-tag-config";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { isLocalDeckId } from "@/stores/local-decks-store";

import { DeckActionsMenu } from "./deck-actions-menu";
import { DeckBoxMarker } from "./deck-box-marker";
import { DeckDomainBar } from "./deck-domain-bar";
import { DeckFormatBadge } from "./deck-format-badge";
import { DeckIdentityLine } from "./deck-identity-line";
import { DeckMetaLine } from "./deck-meta-line";
import { LocalDeckActionsMenu } from "./local-deck-actions-menu";
import { LocalDeckBadge } from "./local-save-hint";

/**
 * Domain icon with a tooltip, as used on the deck tiles.
 * @returns The icon, or null when the domain has no icon asset.
 */
export function DomainIcon({ domain }: { domain: string }) {
  const domainIcon = getFilterIconPath("domains", domain);
  if (!domainIcon) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <img src={domainIcon} alt={domain} className="size-6" />
      </TooltipTrigger>
      <TooltipContent>{domain}</TooltipContent>
    </Tooltip>
  );
}

function CardPreviewImage({
  image,
  alt,
  sizes,
  className,
  style,
  fallback,
}: {
  image: PrintingImage;
  alt: string;
  sizes: string;
  className: string;
  style?: React.CSSProperties;
  /** Rendered instead when the image fails to load — the slot's dashed placeholder. */
  fallback: React.ReactNode;
}) {
  return (
    <ImgWithFallback
      src={imageUrl(image.imageId, "240w")}
      srcSet={`${imageUrl(image.imageId, "120w")} 120w, ${imageUrl(image.imageId, "240w")} 240w, ${imageUrl(image.imageId, "400w")} 400w, ${imageUrl(image.imageId, "full")} 800w`}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      className={className}
      style={{ aspectRatio: "var(--aspect-card)", ...style }}
      fallback={fallback}
    />
  );
}

function PlaceholderPreviewCard({
  iconSrc,
  label,
  className,
  style,
}: {
  iconSrc: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "border-muted-foreground/25 bg-background/40 absolute flex h-[85%] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed",
        className,
      )}
      style={{ aspectRatio: "var(--aspect-card)", ...style }}
    >
      {/* Flat-fill SVG tinted via mask so it follows the theme. */}
      <span
        className="bg-muted-foreground/70 size-7"
        style={{
          mask: `url(${iconSrc}) center / contain no-repeat`,
          WebkitMask: `url(${iconSrc}) center / contain no-repeat`,
        }}
      />
      <span className="text-muted-foreground/70 text-2xs tracking-wide uppercase">{label}</span>
    </div>
  );
}

/**
 * The deck-list tile's fanned art: legend tilted left, champion tilted right,
 * over a domain gradient. Also reused by the deck-check checker hero.
 * @returns The fanned preview block.
 */
export function FannedPreview({
  legendImage,
  championImage,
  coverImage,
  coverPosition,
  gradientStyle,
}: {
  legendImage?: PrintingImage | null;
  championImage?: PrintingImage | null;
  /** Custom cover art for the blurred backdrop; the fan stays legend/champion. */
  coverImage?: PrintingImage | null;
  /** Vertical crop focus for the cover (percent from the top); null = default. */
  coverPosition?: number | null;
  gradientStyle?: React.CSSProperties;
}) {
  const isEmpty = !legendImage && !championImage;
  const backdropImage = coverImage ?? legendImage;
  const legendPlaceholder = (
    <PlaceholderPreviewCard
      iconSrc="/images/types/legend.svg"
      label="Legend"
      className="left-[12%]"
      style={{ transform: "rotate(-6deg)" }}
    />
  );
  const championPlaceholder = (
    <PlaceholderPreviewCard
      iconSrc="/images/supertypes/champion.svg"
      label="Champion"
      className="right-[12%]"
      style={{ transform: "rotate(6deg)" }}
    />
  );
  return (
    // One layout for every fill state: each slot shows its card image, or a
    // dashed placeholder in the same fan position, so a half-built deck
    // previews the exact shape its missing card will fill. The domain
    // gradient only backs the fully-empty tile.
    <div
      className="bg-muted/30 relative flex items-center justify-center overflow-hidden"
      style={{
        aspectRatio: "5 / 3",
        ...(isEmpty
          ? (gradientStyle ?? {
              backgroundImage:
                "radial-gradient(ellipse 70% 80% at 50% 45%, oklch(0.6 0.02 260 / 0.12) 0%, transparent 70%)",
            })
          : undefined),
      }}
    >
      {backdropImage && (
        <>
          {/* Full-art identity: the cover (or legend) art blurred behind the
              fan, with a bottom fade into the tile body. Mirrors the deck
              hero's treatment. */}
          <ImgWithFallback
            src={imageUrl(backdropImage.imageId, "240w")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            style={{ objectPosition: `50% ${coverImage ? (coverPosition ?? 20) : 20}%` }}
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md saturate-125 dark:opacity-40"
            fallback={null}
          />
          <div className="to-card/60 absolute inset-0 bg-gradient-to-b from-transparent via-transparent" />
        </>
      )}
      {legendImage ? (
        <CardPreviewImage
          image={legendImage}
          alt="Legend"
          sizes="160px"
          // Lift via `scale` only: it composes with the slot's inline
          // `transform` rotation, which a class-based translate would not.
          className="absolute h-[85%] rounded-lg object-cover shadow-md transition-[scale] duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          style={{ left: "12%", transform: "rotate(-6deg)" }}
          fallback={legendPlaceholder}
        />
      ) : (
        legendPlaceholder
      )}
      {championImage ? (
        <CardPreviewImage
          image={championImage}
          alt="Champion"
          sizes="160px"
          className="absolute h-[85%] rounded-lg object-cover shadow-md transition-[scale] duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          style={{ right: "12%", transform: "rotate(6deg)" }}
          fallback={championPlaceholder}
        />
      ) : (
        championPlaceholder
      )}
    </div>
  );
}

/**
 * The deck tile's pluralized type summary ("22 units · 12 spells").
 * @returns The joined summary string.
 */
export function typeCountSummary(typeCounts: { cardType: string; count: number }[]): string {
  return typeCounts
    .map(({ cardType, count }) => `${count} ${count === 1 ? cardType : `${cardType}s`}`)
    .join(" · ");
}

/**
 * Visual tile for a single deck in the deck grid.
 * @returns The deck tile element.
 */
export function DeckTile({ item }: { item: DeckListItemResponse }) {
  const {
    deck,
    legendCardId,
    championCardId,
    typeCounts,
    domainDistribution,
    isValid,
    totalCards,
    requiredProgress,
    requiredTotal,
  } = item;
  const isLocal = isLocalDeckId(deck.id);
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const { all: customTags } = useCustomTagList();

  const legendCard = legendCardId ? getPreferredPrinting(legendCardId)?.card : undefined;
  const championCard = championCardId ? getPreferredPrinting(championCardId)?.card : undefined;
  const legendImage = legendCardId ? (getPreferredFrontImage(legendCardId) ?? null) : null;
  const championImage = championCardId ? (getPreferredFrontImage(championCardId) ?? null) : null;
  const coverImage = deck.coverCardId
    ? (getPreferredFrontImage(deck.coverCardId, deck.coverPrintingId ?? undefined) ?? null)
    : null;

  const domainColors = useDomainColors();
  const legendDomains = legendCard?.domains;

  const tagSummary = resolveFormatTagSummary(deck.format, deck.formatConfig, customTags);

  const typeSummary = typeCountSummary(typeCounts);

  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "18", domainColors)
      : undefined;

  return (
    <Link
      to="/decks/$deckId"
      params={{ deckId: deck.id }}
      className={cn(
        cardLinkVariants(),
        // No hover wash here: the domain gradient is an inline style that overrides
        // the wash on legend decks, so drop it everywhere to keep tiles consistent.
        "ring-foreground/10 focus-visible:ring-ring/50 group relative flex flex-col overflow-hidden rounded-lg ring-1 outline-none hover:bg-transparent focus-visible:ring-2 data-[archived=true]:opacity-60",
      )}
      data-archived={deck.archivedAt !== null}
      style={gradientStyle}
    >
      {/* The menu rides above the art rather than sitting in the footer flow:
          there it competed with the stats for width and got clipped by the
          tile's overflow-hidden on narrow columns. */}
      <div className="bg-background/60 absolute top-2 right-2 z-10 rounded-md backdrop-blur-sm">
        {isLocal ? <LocalDeckActionsMenu item={item} /> : <DeckActionsMenu item={item} />}
      </div>

      <FannedPreview
        legendImage={legendImage}
        championImage={championImage}
        coverImage={coverImage}
        coverPosition={deck.coverPosition}
        gradientStyle={
          legendDomains && legendDomains.length > 0
            ? getDomainGradientStyle(legendDomains, "40", domainColors)
            : undefined
        }
      />

      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Name */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {deck.isPinned && (
              <PinIcon className="text-muted-foreground size-3.5 shrink-0" aria-label="Pinned" />
            )}
            {deck.archivedAt !== null && (
              <ArchiveIcon
                className="text-muted-foreground size-3.5 shrink-0"
                aria-label="Archived"
              />
            )}
            <h3 className="truncate leading-tight font-semibold">{deck.name}</h3>
          </div>
          <DeckIdentityLine
            legendCard={legendCard}
            championCard={championCard}
            tagSummary={tagSummary}
            className="mt-0.5"
          />
          {deck.descriptionSnippet && (
            <p className="text-muted-foreground/80 mt-0.5 truncate text-xs">
              {deck.descriptionSnippet}
            </p>
          )}
          <DeckBoxMarker collectionId={deck.collectionId} className="mt-0.5 max-w-full" />
        </div>

        {/* Domain icons, type counts + format badge */}
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className="flex shrink-0 items-center gap-1">
              {legendDomains?.map((domain) => (
                <DomainIcon key={domain} domain={domain} />
              ))}
            </span>
            {/* Truncates rather than pushing the format badge out of the tile:
                a deck with four card types outruns a three-column layout. */}
            {typeSummary && (
              <span className="text-muted-foreground text-2xs ml-1 truncate">{typeSummary}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {isLocal && <LocalDeckBadge className="text-2xs" />}
            <DeckFormatBadge
              format={deck.format}
              totalCards={totalCards}
              requiredProgress={requiredProgress}
              requiredTotal={requiredTotal}
              isValid={isValid}
            />
          </span>
        </div>

        {/* Domain distribution */}
        {domainDistribution.length > 0 && <DeckDomainBar distribution={domainDistribution} />}

        {/* Footer */}
        <DeckMetaLine item={item} className="mt-auto pt-1" />
      </div>
    </Link>
  );
}
