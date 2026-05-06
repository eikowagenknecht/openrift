import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DeckFormat, DeckViolation, DeckZone, Marketplace } from "@openrift/shared";
import { WellKnown, validateDeck } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  LogInIcon,
  PackageSearchIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import type {
  BrowserCardDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/components/deck/deck-dnd-context";
import { OwnershipBar, ownershipPercent } from "@/components/deck/deck-ownership-panel";
import { DomainBar } from "@/components/deck/deck-stats-panel";
import { EnergyChart, PowerChart } from "@/components/deck/stats/energy-power-chart";
import { TypeBreakdown } from "@/components/deck/stats/type-breakdown";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  getDeckCardKey,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "@/lib/deck-builder-card";
import { GROUPED_ZONES, sortOverviewCards, TYPE_GROUP_ORDER } from "@/lib/deck-card-sort";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/onboarding-store";

const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend",
  champion: "Pick a matching Champion",
  runes: "Auto-fills from your Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Add cards from the browser",
  sideboard: "Add up to 8 sideboard cards",
  overflow: "Stash extra cards here while you decide",
};

const LANDSCAPE_ZONES: ReadonlySet<DeckZone> = new Set(["battlefield"]);

// Zones that contribute to the "X / Y" completion count on the Cards KPI
const REQUIRED_ZONES: DeckZone[] = ["legend", "champion", "runes", "battlefield", "main"];
const REQUIRED_TOTAL = REQUIRED_ZONES.reduce((sum, zone) => sum + (ZONE_EXPECTED[zone] ?? 0), 0);

// Small-zone row layout:
//  • @lg: 3 columns — Legend / Champion / Runes on row 1, Battlefield on row 2
//  • @5xl: 5 columns — all four on a single row (1+1+1+2)
const SMALL_ZONES: DeckZone[] = ["legend", "champion", "runes", "battlefield"];
const SMALL_ZONE_SPAN: Partial<Record<DeckZone, string>> = {
  legend: "@lg:col-span-1 @5xl:col-span-1",
  champion: "@lg:col-span-1 @5xl:col-span-1",
  runes: "@lg:col-span-1 @5xl:col-span-1",
  battlefield: "@lg:col-span-3 @5xl:col-span-2",
};

interface DeckOverviewProps {
  deck: { id: string; name: string; format: DeckFormat };
  cards: DeckBuilderCard[];
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  /**
   * Resolves a zone-thumbnail URL for a card. Injected so callers can source
   * thumbs either from the live catalog (deck editor) or from a pre-denormalized
   * payload (public share page SSR). Returning `undefined` hides the thumb.
   */
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  /** Omit on read-only views — zone tiles become non-clickable and edit affordances hide. */
  onZoneClick?: (zone: DeckZone) => void;
  onViewMissing?: () => void;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  /** Disables DnD wiring, printing-menu popovers, and edit buttons. */
  readOnly?: boolean;
  /**
   * When set, renders the deck overview for an anonymous viewer: the
   * Ownership tile is replaced with a sign-in CTA linking here, and the
   * Value tile drops its owned/missing overlay. Used by the public share
   * page for logged-out visitors.
   */
  signInHref?: string;
  /** Long-form deck description rendered above the KPI strip. */
  description?: string;
  /**
   * When set on a read-only overview, card thumbnails become links to the
   * card detail page at the returned slug. Ignored in edit mode (the
   * printing-menu popover takes precedence there).
   */
  getCardSlug?: (cardId: string) => string | undefined;
}

/**
 * Full-width summary shown in the main content area when no deck zone is active.
 * Acts as both a deck dashboard and zone picker — clicking a zone tile drops
 * the user into that zone's card browser. Read-only mode renders the same
 * layout without DnD or edit affordances, for the public share page.
 * @returns The deck overview view.
 */
export function DeckOverview({
  deck,
  cards,
  ownershipData,
  marketplace,
  getThumbnail,
  onZoneClick,
  onViewMissing,
  onHoverCard,
  readOnly,
  signInHref,
  description,
  getCardSlug,
}: DeckOverviewProps) {
  const violations = validateDeck({
    format: deck.format,
    cards: cards.map((card) => ({
      cardId: card.cardId,
      zone: card.zone,
      quantity: card.quantity,
      cardName: card.cardName,
      cardType: card.cardType,
      superTypes: card.superTypes,
      domains: card.domains,
      tags: card.tags,
      keywords: card.keywords,
    })),
  });
  const stats = useDeckStats(cards);
  const domainColors = useDomainColors();
  const fmtPrice = formatterForMarketplace(marketplace);

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const requiredProgress = cards
    .filter((card) => REQUIRED_ZONES.includes(card.zone))
    .reduce((sum, card) => sum + card.quantity, 0);
  const hasLegend = cards.some((card) => card.zone === WellKnown.deckZone.LEGEND);
  const introDismissed = useOnboardingStore((state) => state.deckBuilderIntroDismissed);
  const dismissIntro = useOnboardingStore((state) => state.dismissDeckBuilderIntro);
  const showIntroBanner = !readOnly && totalCards === 0 && !introDismissed;
  const fallbackHint =
    !readOnly && totalCards > 0 && !hasLegend
      ? "Pick a Legend to unlock matching Champions and auto-fill Runes."
      : null;

  const hasAnyViolation = violations.length > 0;
  const isComplete = requiredProgress === REQUIRED_TOTAL && !hasAnyViolation;
  const cardsPct =
    REQUIRED_TOTAL > 0 ? Math.min(100, Math.round((requiredProgress / REQUIRED_TOTAL) * 100)) : 0;

  return (
    <div className="@container flex flex-col gap-6 px-1 pt-2 pb-4">
      {description && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap">{description}</p>
      )}
      {showIntroBanner && <DeckBuilderIntroBanner format={deck.format} onDismiss={dismissIntro} />}
      {fallbackHint && <p className="text-sm">{fallbackHint}</p>}

      {totalCards > 0 && (
        <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-5">
          <KpiTile
            label="Cards"
            value={
              <span>
                {requiredProgress}
                <span className="text-muted-foreground text-sm">/{REQUIRED_TOTAL}</span>
              </span>
            }
            bar={<ProgressBar pct={cardsPct} />}
            caption={
              hasAnyViolation ? (
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Show deck issues"
                        className="text-destructive hover:bg-muted/60 flex items-center gap-1 rounded"
                      />
                    }
                  >
                    <AlertTriangleIcon className="size-3.5" />
                    Invalid
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
                    <ul className="space-y-0.5">
                      {violations.map((violation) => (
                        <li key={violation.code} className="text-xs">
                          {violation.message}
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              ) : isComplete ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-500">
                  <CheckCircle2Icon className="size-3.5" />
                  Complete
                </span>
              ) : (
                `${REQUIRED_TOTAL - requiredProgress} more needed`
              )
            }
          />
          <KpiTile
            label="Domains"
            value={stats.domainDistribution.length > 0 ? stats.domainDistribution.length : "—"}
            bar={
              stats.domainDistribution.length > 0 ? (
                <DomainBar
                  data={stats.domainDistribution}
                  total={stats.totalCards}
                  colors={domainColors}
                  className="h-2"
                />
              ) : undefined
            }
            caption={
              stats.domainDistribution.length > 0 ? (
                <span className="truncate">
                  {stats.domainDistribution.map((entry) => entry.domain).join(" · ")}
                </span>
              ) : undefined
            }
          />
          {ownershipData && !signInHref && (
            <KpiTile
              label="Ownership"
              value={`${ownershipPercent(ownershipData)}%`}
              bar={
                <OwnershipBar
                  pct={ownershipPercent(ownershipData)}
                  owned={ownershipData.totalOwned}
                  total={ownershipData.totalNeeded}
                />
              }
              caption={`${ownershipData.totalOwned} / ${ownershipData.totalNeeded} owned`}
            />
          )}
          {signInHref && <SignInKpi href={signInHref} />}
          {ownershipData?.deckValueCents !== undefined && (
            <ValueKpi
              deckValueCents={ownershipData.deckValueCents}
              ownedValueCents={ownershipData.ownedValueCents}
              missingValueCents={ownershipData.missingValueCents}
              hasMissingCards={ownershipData.missingCards.length > 0}
              fmtPrice={fmtPrice}
              onViewMissing={onViewMissing}
              anonymous={Boolean(signInHref)}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 @lg:grid-cols-3 @5xl:grid-cols-5">
          {SMALL_ZONES.map((zone) => (
            <ZoneTile
              key={zone}
              deckId={deck.id}
              zone={zone}
              label={ZONE_LABELS[zone]}
              cards={cards.filter((card) => card.zone === zone)}
              allCards={cards}
              expected={ZONE_EXPECTED[zone]}
              emptyHint={ZONE_EMPTY_HINTS[zone]}
              zoneViolations={violations.filter(
                (violation) => violation.zone === zone && !violation.cardId,
              )}
              className={SMALL_ZONE_SPAN[zone]}
              onClick={onZoneClick ? () => onZoneClick(zone) : undefined}
              onHoverCard={onHoverCard}
              getThumbnail={getThumbnail}
              readOnly={readOnly}
              getCardSlug={getCardSlug}
            />
          ))}
        </div>
        <ZoneTile
          deckId={deck.id}
          zone="main"
          label={ZONE_LABELS.main}
          cards={cards.filter((card) => card.zone === WellKnown.deckZone.MAIN)}
          allCards={cards}
          expected={ZONE_EXPECTED.main}
          emptyHint={ZONE_EMPTY_HINTS.main}
          zoneViolations={violations.filter(
            (violation) => violation.zone === WellKnown.deckZone.MAIN && !violation.cardId,
          )}
          onClick={onZoneClick ? () => onZoneClick("main") : undefined}
          onHoverCard={onHoverCard}
          getThumbnail={getThumbnail}
          readOnly={readOnly}
          getCardSlug={getCardSlug}
        />
        <ZoneTile
          deckId={deck.id}
          zone="sideboard"
          label={ZONE_LABELS.sideboard}
          cards={cards.filter((card) => card.zone === WellKnown.deckZone.SIDEBOARD)}
          allCards={cards}
          expected={ZONE_EXPECTED.sideboard}
          emptyHint={ZONE_EMPTY_HINTS.sideboard}
          zoneViolations={violations.filter(
            (violation) => violation.zone === WellKnown.deckZone.SIDEBOARD && !violation.cardId,
          )}
          onClick={onZoneClick ? () => onZoneClick("sideboard") : undefined}
          onHoverCard={onHoverCard}
          getThumbnail={getThumbnail}
          readOnly={readOnly}
          getCardSlug={getCardSlug}
        />
        {cards.some((card) => card.zone === WellKnown.deckZone.OVERFLOW) && (
          <ZoneTile
            deckId={deck.id}
            zone="overflow"
            label={ZONE_LABELS.overflow}
            cards={cards.filter((card) => card.zone === WellKnown.deckZone.OVERFLOW)}
            allCards={cards}
            expected={ZONE_EXPECTED.overflow}
            emptyHint={ZONE_EMPTY_HINTS.overflow}
            zoneViolations={violations.filter(
              (violation) => violation.zone === WellKnown.deckZone.OVERFLOW && !violation.cardId,
            )}
            onClick={onZoneClick ? () => onZoneClick("overflow") : undefined}
            onHoverCard={onHoverCard}
            getThumbnail={getThumbnail}
            readOnly={readOnly}
            getCardSlug={getCardSlug}
          />
        )}
      </div>

      {(stats.energyCurve.length > 0 ||
        stats.powerCurve.length > 0 ||
        stats.typeBreakdown.length > 0) && (
        <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
          {stats.energyCurve.length > 0 && (
            <section className="rounded-lg border p-3">
              <EnergyChart
                data={stats.energyCurve}
                stacks={stats.energyCurveStacks}
                average={stats.averageEnergy}
              />
            </section>
          )}
          {stats.powerCurve.length > 0 && (
            <section className="rounded-lg border p-3">
              <PowerChart
                data={stats.powerCurve}
                stacks={stats.powerCurveStacks}
                average={stats.averagePower}
              />
            </section>
          )}
          {stats.typeBreakdown.length > 0 && (
            <section className="rounded-lg border p-3">
              <TypeBreakdown data={stats.typeBreakdown} domains={stats.typeBreakdownDomains} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: React.ReactNode;
  bar?: React.ReactNode;
  caption?: React.ReactNode;
  className?: string;
}

/**
 * A single KPI tile. Every tile follows the same 4-row template so bars and
 * captions line up horizontally across the strip:
 *   1. Label (xs muted)
 *   2. Primary value (lg semibold)
 *   3. Bar slot (h-2) — reserved even when the tile has no bar
 *   4. Caption (xs muted) — reserved min-height matches a size="sm" button so
 *      tiles with an inline action button still align with plain-text tiles
 * @returns The KPI tile.
 */
function KpiTile({ label, value, bar, caption, className }: KpiTileProps) {
  return (
    <div className={cn("bg-card flex flex-col gap-1.5 rounded-lg border p-3", className)}>
      <span className="text-muted-foreground text-xs leading-4">{label}</span>
      <div className="text-lg leading-7 font-semibold tabular-nums">{value}</div>
      <div className="flex h-2 items-center">{bar}</div>
      <div className="text-muted-foreground flex min-h-7 items-center gap-2 text-xs">{caption}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="bg-muted flex h-2 flex-1 overflow-hidden rounded-full">
      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ValueKpi({
  deckValueCents,
  ownedValueCents,
  missingValueCents,
  hasMissingCards,
  fmtPrice,
  onViewMissing,
  anonymous,
}: {
  deckValueCents: number;
  ownedValueCents: number | undefined;
  missingValueCents: number | undefined;
  hasMissingCards: boolean;
  fmtPrice: (cents: number) => string;
  onViewMissing?: () => void;
  anonymous?: boolean;
}) {
  const owned = ownedValueCents ?? 0;
  const ownedPct =
    deckValueCents > 0 ? Math.min(100, Math.round((owned / deckValueCents) * 100)) : 0;
  const hasMissingValue = missingValueCents !== undefined && missingValueCents > 0;

  if (anonymous) {
    return (
      <KpiTile
        className="@3xl:col-span-2"
        label="Value"
        value={fmtPrice(deckValueCents)}
        caption={
          <>
            <span className="truncate">Estimated cost to build</span>
            {onViewMissing && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={onViewMissing}>
                <PackageSearchIcon />
                <span className="sr-only @lg:not-sr-only">View prices</span>
              </Button>
            )}
          </>
        }
      />
    );
  }

  return (
    <KpiTile
      className="@3xl:col-span-2"
      label="Value"
      value={fmtPrice(deckValueCents)}
      bar={
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<div className="flex flex-1" />}>
              <ProgressBar pct={ownedPct} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {fmtPrice(owned)} / {fmtPrice(deckValueCents)} owned
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
      caption={
        <>
          <span className="truncate">
            {hasMissingValue ? `${fmtPrice(missingValueCents)} missing` : "Fully owned"}
          </span>
          {hasMissingCards && onViewMissing && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={onViewMissing}>
              <PackageSearchIcon />
              <span className="sr-only @lg:not-sr-only">View missing</span>
            </Button>
          )}
        </>
      }
    />
  );
}

function SignInKpi({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="bg-card hover:bg-muted/40 flex flex-col gap-1.5 rounded-lg border border-dashed p-3 transition-colors"
    >
      <span className="text-muted-foreground text-xs leading-4">Ownership</span>
      <div className="text-foreground inline-flex items-center gap-1.5 text-lg leading-7 font-semibold">
        <LogInIcon className="size-5" />
        <span>Sign in</span>
      </div>
      <div className="flex h-2" />
      <div className="text-muted-foreground flex min-h-7 items-center text-xs">
        Compare with your collection
      </div>
    </a>
  );
}

// Zones where cards can be freely re-homed via drag. Mirrors the sidebar's
// DRAG_ZONES so the two surfaces behave the same.
const DRAG_SOURCE_ZONES: ReadonlySet<DeckZone> = new Set(["main", "sideboard", "overflow"]);

interface ZoneTileProps {
  deckId: string;
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  allCards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  zoneViolations: DeckViolation[];
  className?: string;
  onClick?: () => void;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  getCardSlug?: (cardId: string) => string | undefined;
}

function ZoneTile({
  deckId,
  zone,
  label,
  cards,
  allCards,
  expected,
  emptyHint,
  zoneViolations,
  className,
  onClick,
  onHoverCard,
  getThumbnail,
  readOnly,
  getCardSlug,
}: ZoneTileProps) {
  const hasViolation = zoneViolations.length > 0;
  const quantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const isEmpty = cards.length === 0;
  const isComplete = !hasViolation && expected !== undefined && quantity === expected;
  const isLandscape = LANDSCAPE_ZONES.has(zone);

  // Match the sidebar's sort: grouped zones order by type (Unit → Spell → Gear)
  // and curve (energy → power → name); single-card zones use the API-provided
  // order (alphabetical by card name within the zone).
  const sortedCards = sortOverviewCards(cards, zone);

  // Drop-target wiring — mirrors the logic in deck-zone-section.tsx so the
  // sidebar and overview reject the same drags (copy limit, battlefield
  // dedupe, 12-rune cap, type compatibility).
  const { active } = useDndContext();
  const dragData = active?.data.current as DeckCardDragData | BrowserCardDragData | undefined;
  const draggedCard =
    dragData?.type === "browser-card"
      ? dragData.card
      : dragData?.type === "deck-card"
        ? allCards.find(
            (card) => card.cardId === dragData.cardId && card.zone === dragData.fromZone,
          )
        : undefined;
  const isDragging = active !== null;

  const isZoneFull =
    isDragging && draggedCard
      ? isDeckZoneFullForDrag({
          zone,
          draggedCardId: draggedCard.cardId,
          fromZone: dragData?.type === "deck-card" ? dragData.fromZone : null,
          allCards,
        })
      : false;

  const dropDisabled =
    isDragging &&
    draggedCard !== undefined &&
    (!isCardAllowedInZone(draggedCard, zone) || isZoneFull);

  const dropData: DeckDropData = { type: "deck-zone", zone };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `overview-zone-${zone}`,
    data: dropData,
    disabled: readOnly || dropDisabled,
  });

  return (
    <div
      ref={readOnly ? undefined : dropRef}
      className={cn(
        "bg-card relative flex flex-col gap-2 rounded-lg border p-3 transition-colors",
        hasViolation && "border-destructive/50",
        !readOnly && isOver && !dropDisabled && "ring-primary/60 ring-2",
        !readOnly && dropDisabled && "opacity-40",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {isComplete && <CheckCircle2Icon className="size-3.5 text-green-600 dark:text-green-500" />}
        {hasViolation && (
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Show ${label} issues`}
                  className="hover:bg-muted/60 flex size-5 shrink-0 items-center justify-center rounded"
                />
              }
            >
              <AlertTriangleIcon className="text-destructive size-3.5" />
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-auto max-w-80 p-2">
              <ul className="space-y-0.5">
                {zoneViolations.map((violation) => (
                  <li key={violation.code} className="text-xs">
                    {violation.message}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            hasViolation ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {quantity}
          {expected !== undefined && `/${expected}`}
        </span>
      </div>

      {isEmpty ? (
        zone === WellKnown.deckZone.RUNES || readOnly || !onClick ? (
          // Runes fills itself when a Legend is set, so the primary path
          // isn't "click this button" — mirror the CTA styling minus the
          // icon and interactivity, and rely on the always-visible pencil
          // for the rare manual-override case. Read-only views also land
          // here since there's no action to take.
          <div className="text-muted-foreground flex items-center justify-center rounded-md border border-dashed px-3 py-4 text-center">
            {readOnly ? "Empty" : emptyHint}
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            aria-label={`Edit ${label}`}
            className="text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 transition-colors"
          >
            <PlusIcon className="size-4" />
            <span>{emptyHint}</span>
          </button>
        )
      ) : GROUPED_ZONES.has(zone) ? (
        <GroupedThumbs
          deckId={deckId}
          zone={zone}
          cards={sortedCards}
          isLandscape={isLandscape}
          onHoverCard={onHoverCard}
          getThumbnail={getThumbnail}
          readOnly={readOnly}
          getCardSlug={getCardSlug}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {sortedCards.map((card) => {
            const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
            if (!thumbnail) {
              return null;
            }
            return (
              <ZoneThumb
                key={getDeckCardKey(card)}
                deckId={deckId}
                card={card}
                zone={zone}
                thumbnail={thumbnail}
                isLandscape={isLandscape}
                onHoverCard={onHoverCard}
                readOnly={readOnly}
                cardSlug={getCardSlug?.(card.cardId)}
              />
            );
          })}
        </div>
      )}

      {!readOnly && onClick && (!isEmpty || zone === WellKnown.deckZone.RUNES) && (
        <button
          type="button"
          onClick={onClick}
          aria-label={`Edit ${label}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md"
        >
          <PencilIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Renders grouped thumbs for main / sideboard / overflow zones. Each type
 * group (Unit / Spell / Gear / other) gets its own row with an icon + name +
 * count header above a flex-wrap of thumbs, mirroring the sidebar's grouped
 * layout but with thumbnails instead of list rows.
 * @returns Stacked type-group sections.
 */
function GroupedThumbs({
  deckId,
  zone,
  cards,
  isLandscape,
  onHoverCard,
  getThumbnail,
  readOnly,
  getCardSlug,
}: {
  deckId: string;
  zone: DeckZone;
  cards: DeckBuilderCard[];
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  getThumbnail: (cardId: string, preferredPrintingId: string | null) => string | undefined;
  readOnly?: boolean;
  getCardSlug?: (cardId: string) => string | undefined;
}) {
  const grouped = Map.groupBy(cards, (card) => card.cardType);
  const presentTypes = [
    ...TYPE_GROUP_ORDER.filter((type) => grouped.has(type)),
    // Any card types outside TYPE_GROUP_ORDER still get a row at the end,
    // preserving the deck's sort order.
    ...[...grouped.keys()].filter((type) => !TYPE_GROUP_ORDER.includes(type)),
  ];

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      {presentTypes.map((type) => {
        const group = grouped.get(type) ?? [];
        const count = group.reduce((sum, card) => sum + card.quantity, 0);
        const iconPath = getTypeIconPath(type, []);
        return (
          <div key={type} className="flex flex-col gap-1.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {iconPath && (
                <img src={iconPath} alt="" className="size-3.5 brightness-0 dark:invert" />
              )}
              <span className="whitespace-nowrap">
                {type}s <span className="text-muted-foreground/60">· {count}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {group.map((card) => {
                const thumbnail = getThumbnail(card.cardId, card.preferredPrintingId);
                if (!thumbnail) {
                  return null;
                }
                return (
                  <ZoneThumb
                    key={getDeckCardKey(card)}
                    deckId={deckId}
                    card={card}
                    zone={zone}
                    thumbnail={thumbnail}
                    isLandscape={isLandscape}
                    onHoverCard={onHoverCard}
                    readOnly={readOnly}
                    cardSlug={getCardSlug?.(card.cardId)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ZoneThumb({
  deckId,
  card,
  zone,
  thumbnail,
  isLandscape,
  onHoverCard,
  readOnly,
  cardSlug,
}: {
  deckId: string;
  card: DeckBuilderCard;
  zone: DeckZone;
  thumbnail: string;
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  readOnly?: boolean;
  cardSlug?: string;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !readOnly && !isMobile && DRAG_SOURCE_ZONES.has(zone);

  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: card.cardName,
    fromZone: zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-thumb-${card.cardId}-${zone}-${card.preferredPrintingId ?? "default"}`,
    data: dragData,
    disabled: !enableDrag,
  });

  const thumbBody = (
    <div
      ref={enableDrag ? setNodeRef : undefined}
      className={cn(
        "relative shrink-0",
        enableDrag && "cursor-grab active:cursor-grabbing",
        isDragging && card.quantity === 1 && "opacity-40",
      )}
      onMouseEnter={() => onHoverCard?.(card.cardId, card.preferredPrintingId)}
      onMouseLeave={() => onHoverCard?.(null)}
      {...(enableDrag ? listeners : {})}
      {...(enableDrag ? attributes : {})}
    >
      <img
        src={thumbnail}
        alt={card.cardName}
        className={cn("rounded-md object-cover shadow-sm", isLandscape ? "h-20 w-28" : "h-28 w-20")}
        draggable={false}
      />
      {card.quantity > 1 && (
        <span className="bg-background/90 text-foreground text-2xs absolute right-0.5 bottom-0.5 rounded px-1 leading-tight font-medium tabular-nums">
          ×{card.quantity}
        </span>
      )}
    </div>
  );

  if (readOnly) {
    if (cardSlug) {
      return (
        <Link to="/cards/$cardSlug" params={{ cardSlug }} className="block">
          {thumbBody}
        </Link>
      );
    }
    return thumbBody;
  }

  return (
    <DeckCardPrintingMenu deckId={deckId} card={card}>
      {thumbBody}
    </DeckCardPrintingMenu>
  );
}

const INTRO_STEPS: readonly { title: string; description: string }[] = [
  { title: "Pick a Legend", description: "Sets your deck's domains. Runes auto-fill 6/6." },
  { title: "Choose a Champion", description: "Suggested by your Legend's tag." },
  { title: "Add Battlefields", description: "Three unique battlefield cards." },
  { title: "Fill the Main Deck", description: "39 units, spells, and gear from your domains." },
];

const INTRO_TIPS: readonly string[] = [
  "Once you're inside a zone, each card in the browser has a small + button on its row — click it to add a copy, or drag the card onto a zone in the sidebar. Hold Shift to add the maximum allowed copies at once.",
  "Edits save automatically as you go.",
];

function DeckBuilderIntroBanner({
  format,
  onDismiss,
}: {
  format: DeckFormat;
  onDismiss: () => void;
}) {
  const formatTip =
    format === WellKnown.deckFormat.CONSTRUCTED
      ? "This deck uses the Constructed format, so it's checked against the rules as you build and violations show up right away. Switch to Freeform if you want to experiment without those restrictions."
      : "This deck uses the Freeform format, so you can build without rule restrictions. Switch to Constructed if you want the rules validated as you go.";
  return (
    <div className="border-border bg-muted/30 relative rounded-lg border p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this guide"
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded p-1"
      >
        <XIcon className="size-4" />
      </button>
      <div className="mx-auto flex max-w-5xl gap-3 pr-6">
        <InfoIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">Build your deck in four steps</p>
            <p className="text-muted-foreground mt-0.5">
              The card browser auto-filters as you fill each zone, so you only see what fits.
            </p>
          </div>
          <div className="grid gap-4 @lg:grid-cols-2">
            <ol className="grid gap-2 self-start">
              {INTRO_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="border-border bg-background flex items-start gap-2 rounded-md border p-2"
                >
                  <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-medium">{step.title}</span>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <p className="font-medium">Good to know</p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  Decks track{" "}
                  <Link
                    to="/help/$slug"
                    params={{ slug: "cards-printings-copies" }}
                    className="text-primary hover:underline"
                  >
                    cards, not specific printings
                  </Link>
                  , so any printing you own counts toward the deck.
                </li>
                {INTRO_TIPS.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
                <li>{formatTip}</li>
              </ul>
            </div>
          </div>
          <Link
            to="/help/$slug"
            params={{ slug: "deck-building" }}
            className="text-primary hover:underline"
          >
            Read the full guide →
          </Link>
        </div>
      </div>
    </div>
  );
}
