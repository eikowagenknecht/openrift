import type { DeckFormat, DeckViolation, Marketplace } from "@openrift/shared";
import { legendDisplayName, WellKnown } from "@openrift/shared";
import { AlertTriangleIcon, CheckCircle2Icon, LogInIcon, PackageSearchIcon } from "lucide-react";

import { DomainBar } from "@/components/deck/deck-stats-panel";
import { DomainIcon, FormatStateBadge } from "@/components/deck/deck-tile";
import { ViolationBadge } from "@/components/deck/deck-validation-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useDeckFormatList } from "@/hooks/use-enums";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDomainColor } from "@/lib/domain";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DeckHeroProps {
  name: string;
  format: DeckFormat;
  violations: DeckViolation[];
  totalCards: number;
  /** Progress across the format's required zones, e.g. 54 of 56. */
  requiredProgress: number;
  requiredTotal: number;
  legend?: DeckBuilderCard;
  champion?: DeckBuilderCard;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  /** Domain distribution + its card total, for the identity strip at the bottom edge. */
  domainDistribution: { domain: string; count: number }[];
  domainTotal: number;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  /** Anonymous share view: the ownership chip becomes a sign-in link to this href. */
  signInHref?: string;
  onViewMissing?: () => void;
  /** When set, the legend/champion names in the subtitle open the card detail. */
  onCardClick?: (card: DeckBuilderCard) => void;
  /** Owner attribution rendered next to the deck name ("by …"). */
  byline?: React.ReactNode;
  /** Action row rendered under the status chips — the share page's copy CTA. */
  actions?: React.ReactNode;
}

/**
 * Ambient background glow built from the legend's domain colors — one radial
 * per domain, anchored to opposite top corners so a dual-domain deck reads as
 * a blend. Decks without a legend get a neutral wash. Shared with the editor
 * sidebar's identity header so both surfaces glow the same way.
 * @returns An inline style with the layered gradients.
 */
export function deckGlowStyle(domains: readonly string[], colors: Record<string, string>) {
  if (domains.length === 0) {
    return {
      backgroundImage:
        "radial-gradient(80% 140% at 20% 0%, oklch(0.6 0.02 260 / 0.14) 0%, transparent 60%)",
    };
  }
  const first = getDomainColor(domains[0], colors);
  const second = domains.length > 1 ? getDomainColor(domains[1], colors) : first;
  return {
    backgroundImage: `radial-gradient(70% 150% at 12% 0%, ${first}3d 0%, transparent 62%), radial-gradient(60% 130% at 88% 0%, ${second}33 0%, transparent 58%)`,
  };
}

const CHIP_CLASS =
  "inline-flex h-6 items-center gap-1 rounded-full border bg-background/60 px-2.5 text-xs backdrop-blur-sm";

/**
 * Chip-shaped button styling for the interactive hero chips (violations,
 * missing, sign-in).
 * @returns The merged class string.
 */
function chipButtonClass(extra?: string) {
  return cn(CHIP_CLASS, "hover:bg-background/80 font-normal", extra);
}

/**
 * A legend/champion name in the hero subtitle — a quiet pivot that opens the
 * card's detail pane when the host provides a click handler, otherwise plain
 * text.
 * @returns The name as a pressable or a span.
 */
function SubtitlePivot({
  label,
  card,
  onCardClick,
}: {
  label: string;
  card: DeckBuilderCard;
  onCardClick?: (card: DeckBuilderCard) => void;
}) {
  if (!onCardClick) {
    return <span className="truncate">{label}</span>;
  }
  return (
    <Pressable
      onClick={() => onCardClick(card)}
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
  if (!thumbnail) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "aspect-card border-muted-foreground/25 bg-background/30 flex h-20 items-center justify-center rounded-md border border-dashed sm:h-28",
          className,
        )}
      >
        <span className="text-muted-foreground/70 text-2xs tracking-wide uppercase">
          {placeholder}
        </span>
      </div>
    );
  }
  return (
    <img
      src={thumbnail}
      alt={alt}
      // Lift via `scale` only — the slot's position rides on translate/rotate
      // classes, which a hover translate would override.
      className={cn(
        "aspect-card h-20 rounded-md object-cover shadow-md sm:h-28",
        "transition-[scale,box-shadow] duration-200 hover:scale-105 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:scale-100",
        className,
      )}
      draggable={false}
    />
  );
}

/**
 * The deck's identity band at the top of the overview and the public share
 * page: domain glow, fanned legend/champion pair, and the deck's status as
 * compact chips (cards, ownership, missing, value). Replaces the old KPI tile
 * strip — same information, folded into the hero.
 * @returns The hero section.
 */
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
  domainDistribution,
  domainTotal,
  ownershipData,
  marketplace,
  signInHref,
  onViewMissing,
  onCardClick,
  byline,
  actions,
}: DeckHeroProps) {
  const domainColors = useDomainColors();
  const { labels: formatLabels } = useDeckFormatList();
  const formatLabel = formatLabels[format] ?? format;
  const fmtPrice = formatterForMarketplace(marketplace);
  const legendDomains = legend?.domains ?? [];
  const hasViolations = violations.length > 0;
  const isComplete = requiredProgress === requiredTotal && !hasViolations;

  const legendThumb = legend ? getThumbnail(legend.cardId, legend.preferredPrintingId) : undefined;
  const championThumb = champion
    ? getThumbnail(champion.cardId, champion.preferredPrintingId)
    : undefined;

  const legendName = legend
    ? legendDisplayName({ name: legend.cardName, types: legend.cardTypes, tags: legend.tags })
    : undefined;

  // Owned chip counts the deck proper (required zones incl. runes, no
  // sideboard) so its denominator matches the completion chip's "X / 56".
  const ownedPct =
    ownershipData && ownershipData.requiredZoneNeeded > 0
      ? Math.min(
          100,
          Math.round((ownershipData.requiredZoneOwned / ownershipData.requiredZoneNeeded) * 100),
        )
      : undefined;
  const missingCount = ownershipData?.missingCount ?? 0;
  const hasMissingValue =
    ownershipData?.missingValueCents !== undefined && ownershipData.missingValueCents > 0;
  // The main/side split only says something once the sideboard carries value —
  // with an empty sideboard the main figure is just the headline again.
  // (Carried over from the old Value KPI tile; shown in a popover on click.)
  const hasValueSplit =
    ownershipData?.mainValueCents !== undefined &&
    ownershipData.sideboardValueCents !== undefined &&
    ownershipData.sideboardValueCents > 0;
  // Completing the deck can be cheaper than the creator's pinned printings —
  // surface both figures in the breakdown when they differ.
  const missingDiffers =
    missingCount > 0 &&
    ownershipData?.missingValueCents !== undefined &&
    ownershipData.missingAsDisplayedValueCents !== undefined &&
    ownershipData.missingValueCents !== ownershipData.missingAsDisplayedValueCents;
  const hasValueBreakdown = hasValueSplit || missingDiffers;

  // Rendered twice (mobile beside the chips, sm+ in the outer row) — plain
  // images, so the duplicate is cheap and the URLs load once.
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

  return (
    <section className="bg-card relative overflow-hidden rounded-xl border">
      <div className="absolute inset-0" style={deckGlowStyle(legendDomains, domainColors)} />
      {legendThumb && (
        <>
          {/* Full-art identity: the legend's art blurred behind a two-direction
              scrim — side fade keeps the text readable, bottom fade settles the
              band into the card surface. scale-110 hides the blur's soft edges. */}
          <img
            src={legendThumb}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 h-full w-full scale-110 object-cover object-[50%_20%] opacity-25 blur-md saturate-125 dark:opacity-40"
          />
          <div className="from-card via-card/70 to-card/30 absolute inset-0 bg-gradient-to-r" />
          <div className="to-card/80 absolute inset-0 bg-gradient-to-b from-transparent via-transparent" />
        </>
      )}
      <div className="relative flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {legendDomains.map((domain) => (
              <DomainIcon key={domain} domain={domain} />
            ))}
            {/* The hero owns the deck's format badge (the top bar dropped its
                duplicate); on problems it opens the violation list, like the
                completion chip. Empty decks read as drafts, not as failures. */}
            {hasViolations && format !== WellKnown.deckFormat.FREEFORM && totalCards > 0 ? (
              <ViolationBadge formatLabel={formatLabel} violations={violations} />
            ) : totalCards === 0 && format !== WellKnown.deckFormat.FREEFORM ? (
              <Badge variant="muted" className="rounded-md">
                {formatLabel} · Draft
              </Badge>
            ) : (
              <FormatStateBadge format={format} isValid={!hasViolations} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="font-heading truncate text-2xl font-bold">{name}</p>
              {byline && <span className="text-muted-foreground shrink-0 text-sm">{byline}</span>}
            </div>
            {(legend || champion) && (
              <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
                {legend && (
                  <SubtitlePivot label={legendName ?? ""} card={legend} onCardClick={onCardClick} />
                )}
                {legend && champion && <span aria-hidden="true">·</span>}
                {champion && (
                  <SubtitlePivot
                    label={champion.cardName}
                    card={champion}
                    onCardClick={onCardClick}
                  />
                )}
              </p>
            )}
          </div>

          {/* Phones: the fanned pair sits beside the chips so the title above
              runs full width; from sm up both wrappers dissolve (contents) and
              the pair lives in the outer row instead. */}
          <div className="flex items-center gap-3 sm:contents">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:contents">
              {totalCards > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {hasViolations ? (
                    <Popover>
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            aria-label="Show deck issues"
                            className={chipButtonClass("text-destructive")}
                          />
                        }
                      >
                        <AlertTriangleIcon className="size-3" />
                        <span className="tabular-nums">
                          {requiredProgress}/{requiredTotal} cards
                        </span>
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
                        <ul className="space-y-0.5">
                          {/* Per-card codes repeat across cards, so the key needs the card. */}
                          {violations.map((violation) => (
                            <li
                              key={`${violation.code}-${violation.cardId ?? "deck"}`}
                              className="text-xs"
                            >
                              {violation.message}
                            </li>
                          ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span
                      className={cn(
                        CHIP_CLASS,
                        "tabular-nums",
                        isComplete && "text-green-600 dark:text-green-500",
                      )}
                    >
                      {isComplete && <CheckCircle2Icon className="size-3" />}
                      {requiredProgress}/{requiredTotal} cards
                      {!isComplete && (
                        <span className="text-muted-foreground">
                          · {requiredTotal - requiredProgress} more
                        </span>
                      )}
                    </span>
                  )}

                  {ownershipData && !signInHref && ownedPct !== undefined && (
                    <span className={cn(CHIP_CLASS, "tabular-nums")}>
                      {ownedPct}% owned
                      <span className="text-muted-foreground">
                        · {ownershipData.requiredZoneOwned}/{ownershipData.requiredZoneNeeded}
                      </span>
                    </span>
                  )}
                  {signInHref && (
                    <Button
                      variant="outline"
                      size="xs"
                      className={chipButtonClass()}
                      // The visible label is the Button's children, which the lint rules can't see through the render prop.
                      // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- text label is inside the Button children
                      render={<a href={signInHref} />}
                    >
                      <LogInIcon className="size-3" />
                      Sign in to compare with your collection
                    </Button>
                  )}

                  {ownershipData && !signInHref && missingCount > 0 && onViewMissing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={onViewMissing}
                      className={chipButtonClass("text-amber-700 dark:text-amber-500")}
                    >
                      <PackageSearchIcon className="size-3" />
                      <span className="tabular-nums">
                        {missingCount} missing
                        {hasMissingValue && ` · ${fmtPrice(ownershipData.missingValueCents ?? 0)}`}
                      </span>
                    </Button>
                  )}
                  {ownershipData && !signInHref && missingCount === 0 && (
                    <span className={cn(CHIP_CLASS, "text-green-600 dark:text-green-500")}>
                      Fully owned
                    </span>
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
                        <PopoverContent side="bottom" align="start" className="w-auto min-w-44 p-2">
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
                            {missingDiffers && (
                              <>
                                <div className="flex justify-between gap-6">
                                  <dt className="text-muted-foreground">Missing, cheapest</dt>
                                  <dd className="tabular-nums">
                                    {fmtPrice(ownershipData.missingValueCents ?? 0)}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <dt className="text-muted-foreground">Missing, as shown</dt>
                                  <dd className="tabular-nums">
                                    {fmtPrice(ownershipData.missingAsDisplayedValueCents ?? 0)}
                                  </dd>
                                </div>
                              </>
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
                </div>
              )}

              {actions && <div className="flex flex-wrap items-center gap-2 pt-1.5">{actions}</div>}
            </div>
            <div className={cn("relative shrink-0 sm:hidden", actions ? "h-28 w-34" : "h-24 w-28")}>
              {fanSlots}
            </div>
          </div>
        </div>

        {/* Narrower than two card widths so the pair overlaps like the deck
            tile's fan; champion renders second, so it sits on top. Tailwind
            v4 transforms only — translate/rotate classes compose as separate
            CSS properties, never mix them with an inline `transform`. With an
            actions row (the share page) the band is taller, so the fan scales
            up to keep filling it. */}
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
    </section>
  );
}
