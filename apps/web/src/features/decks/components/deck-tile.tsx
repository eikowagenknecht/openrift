import { imageUrl } from "@openrift/shared/image-url";
import type { DeckListItemResponse } from "@openrift/shared/types/api/deck";
import type { PrintingImage } from "@openrift/shared/types/catalog";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, PinIcon } from "lucide-react";

import { cardLinkVariants } from "@/components/ui/card-link";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { usePreferredPrinting } from "@/features/cards/hooks/use-preferred-printing";
import { resolveFormatTagSummary } from "@/features/collections/lib/format-tag-config";
import type { DeckFamilyEntry } from "@/features/decks/lib/deck-family";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useCustomTagList } from "@/hooks/use-enums";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

import { DeckActionsMenu } from "./deck-actions-menu";
import { DeckDomainBar } from "./deck-domain-bar";
import { DeckFolderChips } from "./deck-folder-chips";
import { DeckFormatBadge } from "./deck-format-badge";
import { DeckIdentityLine } from "./deck-identity-line";
import { DeckMetaLine } from "./deck-meta-line";
import { DraftBadge, VariantCountToggle } from "./deck-variant-controls";
import { DomainIcon } from "./domain-icon";
import { LocalDeckActionsMenu } from "./local-deck-actions-menu";
import { LocalDeckBadge } from "./local-save-hint";

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

// Also reused by the deck-check checker hero.
export function FannedPreview({
  legendImage,
  championImage,
  coverImage,
  coverPosition,
  gradientStyle,
  soloLegend = false,
}: {
  legendImage?: PrintingImage | null;
  championImage?: PrintingImage | null;
  coverImage?: PrintingImage | null;
  coverPosition?: number | null;
  gradientStyle?: React.CSSProperties;
  soloLegend?: boolean;
}) {
  const isEmpty = !legendImage && !championImage;
  const isSolo = soloLegend && !championImage;
  const backdropImage = coverImage ?? legendImage;
  const legendPlaceholder = isSolo ? (
    <PlaceholderPreviewCard
      iconSrc="/images/types/legend.svg"
      label="Legend"
      className="left-1/2"
      style={{ transform: "translateX(-50%) rotate(-4deg)" }}
    />
  ) : (
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
          <div className="to-card/60 absolute inset-0 bg-linear-to-b from-transparent via-transparent" />
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
          style={
            isSolo
              ? { left: "50%", transform: "translateX(-50%) rotate(-4deg)" }
              : { left: "12%", transform: "rotate(-6deg)" }
          }
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
        !isSolo && championPlaceholder
      )}
    </div>
  );
}

export function typeCountSummary(typeCounts: { cardType: string; count: number }[]): string {
  return typeCounts
    .map(({ cardType, count }) => `${count} ${count === 1 ? cardType : `${cardType}s`}`)
    .join(" · ");
}

export function DeckTile({
  item,
  folderLabels = {},
  family,
  onToggleFamily,
}: {
  item: DeckListItemResponse;
  folderLabels?: Record<string, string>;
  family?: DeckFamilyEntry;
  onToggleFamily?: (familyId: string) => void;
}) {
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

  // Built before the return so the narrowing survives into the JSX.
  const variantToggle =
    family && onToggleFamily && family.role === "front" && family.memberCount > 1 ? (
      <VariantCountToggle family={family} onToggle={onToggleFamily} />
    ) : null;

  return (
    <div
      className={cn(
        cardLinkVariants(),
        "ring-border group relative flex flex-col overflow-hidden rounded-lg ring-1 hover:bg-transparent data-[archived=true]:opacity-60",
        // An anchor can't contain the menu and badges here, so the name's
        // ::after link stretches over the tile, and the ring follows it.
        "has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-2",
        // Must sit above the ::after overlay or hover never reaches them.
        "**:data-[slot=tooltip-trigger]:relative **:data-[slot=tooltip-trigger]:z-10",
        "[&_[title]]:relative [&_[title]]:z-10",
      )}
      data-archived={deck.archivedAt !== null}
      style={gradientStyle}
    >
      <div className="bg-background/60 absolute top-2 right-2 z-10 rounded-md backdrop-blur-sm">
        {isLocal ? <LocalDeckActionsMenu item={item} /> : <DeckActionsMenu item={item} />}
      </div>

      {variantToggle && (
        <div className="bg-background/60 absolute top-2 left-2 z-10 rounded-md backdrop-blur-sm">
          {variantToggle}
        </div>
      )}

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
            <h3 className="min-w-0 truncate leading-tight font-semibold">
              <Link
                to="/decks/$deckId"
                params={{ deckId: deck.id }}
                className="rounded-lg outline-none after:absolute after:inset-0"
              >
                {deck.name}
              </Link>
            </h3>
            {deck.isDraft && <DraftBadge />}
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
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className="flex shrink-0 items-center gap-1">
              {legendDomains?.map((domain) => (
                <DomainIcon key={domain} domain={domain} />
              ))}
            </span>
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

        <DeckFolderChips folderIds={item.folderIds} folderLabels={folderLabels} />

        {domainDistribution.length > 0 && <DeckDomainBar distribution={domainDistribution} />}

        <DeckMetaLine item={item} className="mt-auto pt-1" />
      </div>
    </div>
  );
}
