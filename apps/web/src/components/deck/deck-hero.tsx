import type { DeckViolation } from "@openrift/shared/deck-rules";
import type { DeckFormat } from "@openrift/shared/types/enums";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { deckIdentityLabels, legendDisplayName } from "@openrift/shared/utils";
import {
  BoxIcon,
  CheckCircle2Icon,
  HandHeartIcon,
  LogInIcon,
  PackageSearchIcon,
} from "lucide-react";

import { ArtBandBackdrop } from "@/components/art-band-backdrop";
import { DeckFormatBadge } from "@/components/deck/deck-format-badge";
import { DomainBar } from "@/components/deck/deck-stats-panel";
import { DomainIcon } from "@/components/deck/domain-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { CARD_BORDER_RADIUS } from "@/lib/card-grid-constants";
import type { CardOpenTarget } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DeckHeroProps {
  name: string;
  format: DeckFormat;
  violations: DeckViolation[];
  totalCards: number;
  requiredProgress: number;
  requiredTotal: number;
  legend?: DeckBuilderCard;
  champion?: DeckBuilderCard;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  /** position is percent from top; null keeps default framing, absent derives from legend. */
  cover?: { thumbnail: string; position: number | null };
  domainDistribution: { domain: string; count: number }[];
  domainTotal: number;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  signInHref?: string;
  onViewMissing?: () => void;
  onCardClick?: (card: CardOpenTarget) => void;
  /** Owner-only: the public share page never resolves one. */
  box?: { name: string; onOpen: () => void };
  byline?: React.ReactNode;
  heading?: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}

const CHIP_CLASS =
  "inline-flex h-6 items-center gap-1 rounded-full border bg-background/60 px-2.5 text-xs backdrop-blur-sm";

function chipButtonClass(extra?: string) {
  return cn(CHIP_CLASS, "hover:bg-background/80 font-normal", extra);
}

function SubtitlePivot({
  label,
  roleLabel,
  fullName,
  card,
  onCardClick,
}: {
  label: string;
  roleLabel: string;
  fullName: string;
  card: DeckBuilderCard;
  onCardClick?: (card: CardOpenTarget) => void;
}) {
  const spokenName = `${roleLabel}: ${fullName}`;
  if (!onCardClick) {
    return (
      <span className="truncate" title={spokenName}>
        {label}
      </span>
    );
  }
  return (
    <Pressable
      onClick={() => onCardClick(card)}
      aria-label={spokenName}
      title={spokenName}
      className="hover:text-foreground truncate hover:underline"
    >
      {label}
    </Pressable>
  );
}

function HeroFanSlot({
  thumbnail,
  alt,
  placeholder,
  className,
}: {
  thumbnail?: string;
  alt: string;
  placeholder: string;
  className?: string;
}) {
  const placeholderBody = (
    <div
      aria-hidden="true"
      style={{ borderRadius: CARD_BORDER_RADIUS }}
      className={cn(
        "aspect-card border-muted-foreground/25 bg-background/30 flex h-20 items-center justify-center border border-dashed sm:h-28",
        className,
      )}
    >
      <span className="text-muted-foreground/70 text-2xs tracking-wide uppercase">
        {placeholder}
      </span>
    </div>
  );
  if (!thumbnail) {
    return placeholderBody;
  }
  return (
    <ImgWithFallback
      src={thumbnail}
      alt={alt}
      fallback={placeholderBody}
      style={{ borderRadius: CARD_BORDER_RADIUS }}
      // Lift via `scale` only — the slot's position rides on translate/rotate
      // classes, which a hover translate would override.
      className={cn(
        "aspect-card h-20 object-cover shadow-md sm:h-28",
        "transition-[scale,box-shadow] duration-200 hover:scale-105 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
      draggable={false}
    />
  );
}

export function DeckHero({
  name,
  format,
  violations,
  totalCards,
  requiredProgress,
  requiredTotal,
  legend,
  champion,
  getThumbnail,
  cover,
  domainDistribution,
  domainTotal,
  ownershipData,
  marketplace,
  signInHref,
  onViewMissing,
  onCardClick,
  box,
  byline,
  heading,
  lead,
  actions,
}: DeckHeroProps) {
  const domainColors = useDomainColors();
  const fmtPrice = formatterForMarketplace(marketplace);
  const legendDomains = legend?.domains ?? [];
  const hasViolations = violations.length > 0;

  const legendThumb = legend ? getThumbnail(legend.cardId, legend.preferredPrintingId) : undefined;
  const championThumb = champion
    ? getThumbnail(champion.cardId, champion.preferredPrintingId)
    : undefined;

  const legendName = legend
    ? legendDisplayName({ name: legend.cardName, types: legend.cardTypes, tags: legend.tags })
    : undefined;

  const identity = deckIdentityLabels(
    legend && { name: legend.cardName, types: legend.cardTypes, tags: legend.tags },
    champion && { name: champion.cardName },
  );

  // Ownership fraction counts required zones only (no sideboard); the
  // sideboard shortfall is named separately and must not blur into one number.
  const missingCount = ownershipData?.missingCount ?? 0;
  const borrowedCount = ownershipData?.totalBorrowed ?? 0;
  const requiredZoneMissing = ownershipData?.requiredZoneMissing ?? 0;
  const sideboardMissing = ownershipData?.sideboardMissing ?? 0;
  const missingLabel =
    requiredZoneMissing > 0 && sideboardMissing > 0
      ? `${requiredZoneMissing} + ${sideboardMissing} side missing`
      : requiredZoneMissing > 0
        ? `${requiredZoneMissing} missing`
        : `${sideboardMissing} side missing`;
  const hasMissingValue =
    ownershipData?.missingValueCents !== undefined && ownershipData.missingValueCents > 0;
  const hasValueSplit =
    ownershipData?.mainValueCents !== undefined &&
    ownershipData.sideboardValueCents !== undefined &&
    ownershipData.sideboardValueCents > 0;
  // Headline prices the cheapest acceptable printing; a pinned premium
  // printing only shows here as "At shown printings" in the popover.
  const asDisplayedDiffers =
    ownershipData?.deckValueCents !== undefined &&
    ownershipData.asDisplayedValueCents !== undefined &&
    ownershipData.asDisplayedValueCents !== ownershipData.deckValueCents;
  const hasValueBreakdown = hasValueSplit || hasMissingValue || asDisplayedDiffers;

  const formatBadge = (
    <DeckFormatBadge
      format={format}
      totalCards={totalCards}
      requiredProgress={requiredProgress}
      requiredTotal={requiredTotal}
      isValid={!hasViolations}
      violations={violations}
    />
  );

  const fanSlots = (
    <>
      <HeroFanSlot
        thumbnail={legendThumb}
        alt={legendName ?? "Legend"}
        placeholder="Legend"
        className={cn(
          "absolute top-1/2 left-0 -translate-y-1/2 -rotate-6",
          actions && "h-24 sm:h-36",
        )}
      />
      <HeroFanSlot
        thumbnail={championThumb}
        alt={champion?.cardName ?? "Champion"}
        placeholder="Champion"
        className={cn(
          "absolute top-1/2 right-0 -translate-y-1/2 rotate-6",
          actions && "h-24 sm:h-36",
        )}
      />
    </>
  );

  const backdropThumb = cover?.thumbnail ?? legendThumb;

  return (
    <Card className="relative gap-0 py-0">
      <ArtBandBackdrop
        thumbnail={backdropThumb}
        position={cover?.position ?? 20}
        domains={legendDomains}
      />
      <div className="relative flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
        {lead}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {heading ?? (
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-heading truncate text-2xl font-bold">{name}</p>
                {/* self-center: row aligns on text baseline, which an image meets at its bottom edge. */}
                {legendDomains.length > 0 && (
                  <span className="flex shrink-0 items-center gap-1 self-center">
                    {legendDomains.map((domain) => (
                      <DomainIcon key={domain} domain={domain} />
                    ))}
                  </span>
                )}
                {byline && <span className="text-muted-foreground min-w-0 text-sm">{byline}</span>}
              </div>
              {(legend || champion) && (
                <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
                  {identity.character !== undefined && (
                    <span className="text-foreground shrink-0 font-medium">
                      {identity.character}
                    </span>
                  )}
                  {legend && (
                    <SubtitlePivot
                      label={identity.legend ?? ""}
                      roleLabel="Legend"
                      fullName={legendName ?? ""}
                      card={legend}
                      onCardClick={onCardClick}
                    />
                  )}
                  {legend && champion && <span aria-hidden="true">·</span>}
                  {champion && (
                    <SubtitlePivot
                      label={identity.champion ?? ""}
                      roleLabel="Champion"
                      fullName={champion.cardName}
                      card={champion}
                      onCardClick={onCardClick}
                    />
                  )}
                </p>
              )}
            </div>
          )}

          {/* sm:contents dissolves both wrappers so the pair joins the outer row. */}
          <div className="flex items-center gap-3 sm:contents">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:contents">
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {formatBadge}
                {totalCards > 0 && (
                  <>
                    {ownershipData && !signInHref && missingCount > 0 && onViewMissing && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={onViewMissing}
                        className={chipButtonClass()}
                      >
                        <PackageSearchIcon className="text-warning size-3" />
                        <span className="tabular-nums">
                          {ownershipData.requiredZoneNeeded > 0 && (
                            <>
                              {ownershipData.requiredZoneOwned}/{ownershipData.requiredZoneNeeded}{" "}
                              owned ·{" "}
                            </>
                          )}
                          <span className="text-warning">{missingLabel}</span>
                        </span>
                      </Button>
                    )}
                    {ownershipData && !signInHref && missingCount === 0 && (
                      <span className={cn(CHIP_CLASS, "text-success")}>
                        <CheckCircle2Icon className="size-3" />
                        {/* Borrowed copies count toward "ready" but not ownership. */}
                        {borrowedCount > 0 ? "Ready to play" : "Fully owned"}
                      </span>
                    )}
                    {ownershipData && !signInHref && borrowedCount > 0 && (
                      <span
                        className={cn(CHIP_CLASS, "text-violet")}
                        title="Copies you're borrowing from friends. They count as buildable while you have them, but they aren't part of your collection."
                      >
                        <HandHeartIcon className="size-3" />
                        <span className="tabular-nums">{borrowedCount} borrowed</span>
                      </span>
                    )}
                    {signInHref && (
                      <Button
                        variant="outline"
                        size="xs"
                        className={chipButtonClass()}
                        // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- text label is inside the Button children
                        render={<a href={signInHref} />}
                      >
                        <LogInIcon className="size-3" />
                        Sign in to compare with your collection
                      </Button>
                    )}

                    {ownershipData?.deckValueCents !== undefined &&
                      (signInHref && onViewMissing ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={onViewMissing}
                          className={chipButtonClass()}
                        >
                          <span className="tabular-nums">
                            {fmtPrice(ownershipData.deckValueCents)}
                          </span>
                          <span className="text-muted-foreground">· view prices</span>
                        </Button>
                      ) : hasValueBreakdown ? (
                        <Popover>
                          <PopoverTrigger
                            render={
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                aria-label="Show value breakdown"
                                className={chipButtonClass("tabular-nums")}
                              />
                            }
                          >
                            {fmtPrice(ownershipData.deckValueCents)}
                            <span className="text-muted-foreground">value</span>
                          </PopoverTrigger>
                          <PopoverContent
                            side="bottom"
                            align="start"
                            className="w-auto min-w-44 p-2"
                          >
                            <dl className="flex flex-col gap-1 text-xs">
                              {hasValueSplit && (
                                <>
                                  <div className="flex justify-between gap-6">
                                    <dt className="text-muted-foreground">Main deck</dt>
                                    <dd className="tabular-nums">
                                      {fmtPrice(ownershipData.mainValueCents ?? 0)}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-6">
                                    <dt className="text-muted-foreground">Sideboard</dt>
                                    <dd className="tabular-nums">
                                      {fmtPrice(ownershipData.sideboardValueCents ?? 0)}
                                    </dd>
                                  </div>
                                </>
                              )}
                              {asDisplayedDiffers && (
                                <div className="flex justify-between gap-6">
                                  <dt className="text-muted-foreground">At shown printings</dt>
                                  <dd className="tabular-nums">
                                    {fmtPrice(ownershipData.asDisplayedValueCents ?? 0)}
                                  </dd>
                                </div>
                              )}
                              {hasMissingValue && (
                                <div className="flex justify-between gap-6">
                                  <dt className="text-muted-foreground">To complete</dt>
                                  <dd className="tabular-nums">
                                    {fmtPrice(ownershipData.missingValueCents ?? 0)}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className={cn(CHIP_CLASS, "tabular-nums")}>
                          {fmtPrice(ownershipData.deckValueCents)}
                          <span className="text-muted-foreground">value</span>
                        </span>
                      ))}
                  </>
                )}
                {/* Outside the card-count guard: an empty deck can already have a box assigned. */}
                {box && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className={chipButtonClass()}
                    onClick={() => box.onOpen()}
                  >
                    <BoxIcon className="size-3" />
                    <span className="max-w-40 truncate">{box.name}</span>
                  </Button>
                )}
              </div>

              {actions && <div className="flex flex-wrap items-center gap-2 pt-1.5">{actions}</div>}
            </div>
            <div className={cn("relative shrink-0 sm:hidden", actions ? "h-28 w-34" : "h-24 w-28")}>
              {fanSlots}
            </div>
          </div>
        </div>

        {/* Tailwind v4: translate/rotate compose as separate properties, never mix with an inline transform. */}
        <div
          className={cn(
            "relative hidden shrink-0 sm:block",
            actions ? "sm:h-40 sm:w-44" : "sm:h-32 sm:w-36",
          )}
        >
          {fanSlots}
        </div>
      </div>

      {domainDistribution.length > 0 && (
        <DomainBar
          data={domainDistribution}
          total={domainTotal}
          colors={domainColors}
          className="relative h-1"
        />
      )}
    </Card>
  );
}
