import type { DeckFormat, DeckViolation, Marketplace } from "@openrift/shared";
import { deckIdentityLabels, legendDisplayName } from "@openrift/shared";
import {
  BoxIcon,
  CheckCircle2Icon,
  HandHeartIcon,
  LogInIcon,
  PackageSearchIcon,
} from "lucide-react";

import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { DeckFormatBadge } from "@/components/deck/deck-format-badge";
import { DomainBar } from "@/components/deck/deck-stats-panel";
import { DomainIcon } from "@/components/deck/deck-tile";
import { Button } from "@/components/ui/button";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDomainColors } from "@/hooks/use-domain-colors";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { deckGlowStyle } from "@/lib/domain";
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
  /**
   * Custom cover art for the blurred backdrop, when the owner picked one.
   * `position` is the vertical crop focus (percent from the top); null keeps
   * the default framing. Absent = derive from the legend as always.
   */
  cover?: { thumbnail: string; position: number | null };
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
  /**
   * The collection this deck is physically stored in, and the way into the Box
   * tab that fills it. Owner-only — the public share page never resolves one,
   * so the chip stays off there.
   */
  box?: { name: string; onOpen: () => void };
  /** Owner attribution rendered next to the deck name ("by …"). */
  byline?: React.ReactNode;
  /** Action row rendered under the status chips — the share page's copy CTA. */
  actions?: React.ReactNode;
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
  roleLabel,
  fullName,
  card,
  onCardClick,
}: {
  label: string;
  /**
   * "Legend" or "Champion" — spoken with the full name, which the visible label
   * may have shortened. Not `role`: that name reads as an ARIA role.
   */
  roleLabel: string;
  fullName: string;
  card: DeckBuilderCard;
  onCardClick?: (card: DeckBuilderCard) => void;
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

/**
 * The deck's identity band at the top of the overview and the public share
 * page: domain glow, fanned legend/champion pair, and the deck's status as
 * compact chips (ownership, value — build progress lives on the format badge).
 * Replaces the old KPI tile strip — same information, folded into the hero.
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

  // The subtitle names the champion once when the Legend and the champion unit
  // share one (always, in constructed) — "Mel Soul's Reflection · Newly
  // Awakened" instead of repeating "Mel," on both halves.
  const identity = deckIdentityLabels(
    legend && { name: legend.cardName, types: legend.cardTypes, tags: legend.tags },
    champion && { name: champion.cardName },
  );

  // The ownership chip's fraction counts the deck proper (required zones incl.
  // runes, no sideboard) so its denominator matches the format badge's "X / 56"
  // build figure. The missing part names the sideboard shortfall separately
  // ("4 + 2 side missing") — the two scopes must never blur into one number.
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
  // The main/side split only says something once the sideboard carries value —
  // with an empty sideboard the main figure is just the headline again.
  // (Carried over from the old Value KPI tile; shown in a popover on click.)
  const hasValueSplit =
    ownershipData?.mainValueCents !== undefined &&
    ownershipData.sideboardValueCents !== undefined &&
    ownershipData.sideboardValueCents > 0;
  // The headline prices every card at its cheapest acceptable printing; a
  // pinned premium printing only shows up here, as the "At shown printings"
  // total in the popover.
  const asDisplayedDiffers =
    ownershipData?.deckValueCents !== undefined &&
    ownershipData.asDisplayedValueCents !== undefined &&
    ownershipData.asDisplayedValueCents !== ownershipData.deckValueCents;
  // The cost to complete lives in this popover now (the missing chip that used
  // to carry it merged into the ownership chip).
  const hasValueBreakdown = hasValueSplit || hasMissingValue || asDisplayedDiffers;

  // The hero owns the deck's format badge (the top bar dropped its duplicate);
  // on problems it opens the violation list and carries the build progress
  // ("48/56") while the deck is incomplete — the old separate cards chip folded
  // in here. Empty decks read as drafts, not as failures. It leads the chip row
  // below the title, so the deck's state reads left to right with ownership and
  // value; the domain icons sit up with the name instead. The deck tiles and
  // list rows render the same component, so the states never drift.
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

  // The blurred identity backdrop: the owner's chosen cover when set, the
  // legend's art otherwise. The ambient glow stays legend-driven either way —
  // domain identity belongs to the legend, the cover is just the picture.
  const backdropThumb = cover?.thumbnail ?? legendThumb;
  const backdropPosition = `50% ${cover?.position ?? 20}%`;

  return (
    <section className="bg-card relative overflow-hidden rounded-xl border">
      <div className="absolute inset-0" style={deckGlowStyle(legendDomains, domainColors)} />
      {backdropThumb && (
        <>
          {/* Full-art identity: the cover art blurred behind a two-direction
              scrim — side fade keeps the text readable, bottom fade settles the
              band into the card surface. scale-110 hides the blur's soft edges. */}
          <img
            src={backdropThumb}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{ objectPosition: backdropPosition }}
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md saturate-125 dark:opacity-40"
          />
          <div className="from-card via-card/70 to-card/30 absolute inset-0 bg-gradient-to-r" />
          <div className="to-card/80 absolute inset-0 bg-gradient-to-b from-transparent via-transparent" />
        </>
      )}
      <div className="relative flex items-center gap-4 p-4 sm:gap-6 sm:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <p className="font-heading truncate text-2xl font-bold">{name}</p>
              {/* The domains ride with the name, not on a row of their own.
                  `self-center` because the row aligns on the text baseline,
                  which an image would meet with its bottom edge. */}
              {legendDomains.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 self-center">
                  {legendDomains.map((domain) => (
                    <DomainIcon key={domain} domain={domain} />
                  ))}
                </span>
              )}
              {byline && <span className="text-muted-foreground shrink-0 text-sm">{byline}</span>}
            </div>
            {(legend || champion) && (
              <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
                {identity.character !== undefined && (
                  <span className="text-foreground shrink-0 font-medium">{identity.character}</span>
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

          {/* Phones: the fanned pair sits beside the chips so the title above
              runs full width; from sm up both wrappers dissolve (contents) and
              the pair lives in the outer row instead. */}
          <div className="flex items-center gap-3 sm:contents">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:contents">
              {/* The format badge always leads this row, so an empty deck still
                  shows its format even though the ownership and value chips
                  have nothing to say yet. */}
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
                        <PackageSearchIcon className="size-3 text-amber-700 dark:text-amber-500" />
                        <span className="tabular-nums">
                          {ownershipData.requiredZoneNeeded > 0 && (
                            <>
                              {ownershipData.requiredZoneOwned}/{ownershipData.requiredZoneNeeded}{" "}
                              owned ·{" "}
                            </>
                          )}
                          <span className="text-amber-700 dark:text-amber-500">{missingLabel}</span>
                        </span>
                      </Button>
                    )}
                    {ownershipData && !signInHref && missingCount === 0 && (
                      <span className={cn(CHIP_CLASS, "text-green-600 dark:text-green-500")}>
                        <CheckCircle2Icon className="size-3" />
                        {/* Borrowed copies close the shortfall without being
                            owned, so a deck completed with a friend's cards
                            must not claim ownership of them. */}
                        {borrowedCount > 0 ? "Ready to play" : "Fully owned"}
                      </span>
                    )}
                    {ownershipData && !signInHref && borrowedCount > 0 && (
                      <span
                        className={cn(CHIP_CLASS, "text-violet-700 dark:text-violet-400")}
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
                        // The visible label is the Button's children, which the lint rules can't see through the render prop.
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
                {/* Outside the card-count guard: an empty deck can already have
                    a box assigned, and where it lives is worth saying then too. */}
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
