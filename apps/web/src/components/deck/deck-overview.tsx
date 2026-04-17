import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import type { DeckZone, Marketplace } from "@openrift/shared";
import { AlertTriangleIcon, CheckCircle2Icon, PackageSearchIcon } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useDeckDetail } from "@/hooks/use-decks";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { isCardAllowedInZone } from "@/lib/deck-builder-card";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { formatterForMarketplace } from "@/lib/format";
import { cn } from "@/lib/utils";

const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
  main: 39,
};

const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Choose a Legend to get started",
  champion: "Pick a Champion that matches your Legend",
  runes: "Auto-fills when you set a Legend",
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
  deckId: string;
  ownershipData?: DeckOwnershipData;
  marketplace: Marketplace;
  onZoneClick: (zone: DeckZone) => void;
  onViewMissing: () => void;
  onHoverCard?: (cardId: string | null) => void;
}

/**
 * Full-width summary shown in the main content area when no deck zone is active.
 * Acts as both a deck dashboard and zone picker — clicking a zone tile drops
 * the user into that zone's card browser.
 * @returns The deck overview view.
 */
export function DeckOverview({
  deckId,
  ownershipData,
  marketplace,
  onZoneClick,
  onViewMissing,
  onHoverCard,
}: DeckOverviewProps) {
  const { data: deckDetail } = useDeckDetail(deckId);
  const cards = useDeckCards(deckId);
  const violations = useDeckViolations(deckId, deckDetail.deck.format);
  const stats = useDeckStats(deckId);
  const domainColors = useDomainColors();
  const { getPreferredFrontImage } = usePreferredPrinting();
  const fmtPrice = formatterForMarketplace(marketplace);

  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const requiredProgress = cards
    .filter((card) => REQUIRED_ZONES.includes(card.zone))
    .reduce((sum, card) => sum + card.quantity, 0);
  const hasLegend = cards.some((card) => card.zone === "legend");
  const hint =
    totalCards === 0
      ? "Start by picking a Legend, then Champions, Runes, and the main deck unlock around it."
      : hasLegend
        ? null
        : "Pick a Legend to unlock matching Champions and auto-fill Runes.";

  const hasAnyViolation = violations.length > 0;
  const isComplete = requiredProgress === REQUIRED_TOTAL && !hasAnyViolation;
  const cardsPct =
    REQUIRED_TOTAL > 0 ? Math.min(100, Math.round((requiredProgress / REQUIRED_TOTAL) * 100)) : 0;

  return (
    <div className="@container flex flex-col gap-6 px-1 pt-2 pb-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">{deckDetail.deck.name}</h2>
        <p className="text-muted-foreground text-sm">
          {deckDetail.deck.format === "constructed" ? "Constructed" : "Freeform"}
        </p>
        {hint && <p className="text-sm">{hint}</p>}
      </header>

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
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangleIcon className="size-3.5" />
                  Invalid
                </span>
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
          {ownershipData && (
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
          {ownershipData?.deckValueCents !== undefined && (
            <ValueKpi
              deckValueCents={ownershipData.deckValueCents}
              ownedValueCents={ownershipData.ownedValueCents}
              missingValueCents={ownershipData.missingValueCents}
              hasMissingCards={ownershipData.missingCards.length > 0}
              fmtPrice={fmtPrice}
              onViewMissing={onViewMissing}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 @lg:grid-cols-3 @5xl:grid-cols-5">
          {SMALL_ZONES.map((zone) => (
            <ZoneTile
              key={zone}
              zone={zone}
              label={ZONE_LABELS[zone]}
              cards={cards.filter((card) => card.zone === zone)}
              allCards={cards}
              expected={ZONE_EXPECTED[zone]}
              emptyHint={ZONE_EMPTY_HINTS[zone]}
              hasViolation={violations.some(
                (violation) => violation.zone === zone && !violation.cardId,
              )}
              className={SMALL_ZONE_SPAN[zone]}
              onClick={() => onZoneClick(zone)}
              onHoverCard={onHoverCard}
              getThumbnail={(cardId) => getPreferredFrontImage(cardId)?.thumbnail}
            />
          ))}
        </div>
        <ZoneTile
          zone="main"
          label={ZONE_LABELS.main}
          cards={cards.filter((card) => card.zone === "main")}
          allCards={cards}
          expected={ZONE_EXPECTED.main}
          emptyHint={ZONE_EMPTY_HINTS.main}
          hasViolation={violations.some(
            (violation) => violation.zone === "main" && !violation.cardId,
          )}
          onClick={() => onZoneClick("main")}
          onHoverCard={onHoverCard}
          getThumbnail={(cardId) => getPreferredFrontImage(cardId)?.thumbnail}
        />
        <ZoneTile
          zone="sideboard"
          label={ZONE_LABELS.sideboard}
          cards={cards.filter((card) => card.zone === "sideboard")}
          allCards={cards}
          expected={ZONE_EXPECTED.sideboard}
          emptyHint={ZONE_EMPTY_HINTS.sideboard}
          hasViolation={violations.some(
            (violation) => violation.zone === "sideboard" && !violation.cardId,
          )}
          onClick={() => onZoneClick("sideboard")}
          onHoverCard={onHoverCard}
          getThumbnail={(cardId) => getPreferredFrontImage(cardId)?.thumbnail}
        />
        {cards.some((card) => card.zone === "overflow") && (
          <ZoneTile
            zone="overflow"
            label={ZONE_LABELS.overflow}
            cards={cards.filter((card) => card.zone === "overflow")}
            allCards={cards}
            expected={ZONE_EXPECTED.overflow}
            emptyHint={ZONE_EMPTY_HINTS.overflow}
            hasViolation={violations.some(
              (violation) => violation.zone === "overflow" && !violation.cardId,
            )}
            onClick={() => onZoneClick("overflow")}
            onHoverCard={onHoverCard}
            getThumbnail={(cardId) => getPreferredFrontImage(cardId)?.thumbnail}
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
}: {
  deckValueCents: number;
  ownedValueCents: number | undefined;
  missingValueCents: number | undefined;
  hasMissingCards: boolean;
  fmtPrice: (cents: number) => string;
  onViewMissing: () => void;
}) {
  const owned = ownedValueCents ?? 0;
  const ownedPct =
    deckValueCents > 0 ? Math.min(100, Math.round((owned / deckValueCents) * 100)) : 0;
  const hasMissingValue = missingValueCents !== undefined && missingValueCents > 0;

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
          {hasMissingCards && (
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

// Zones where cards can be freely re-homed via drag. Mirrors the sidebar's
// DRAG_ZONES so the two surfaces behave the same.
const DRAG_SOURCE_ZONES: ReadonlySet<DeckZone> = new Set(["main", "sideboard", "overflow"]);
const COPY_LIMIT_ZONES: ReadonlySet<DeckZone> = new Set([
  "main",
  "sideboard",
  "overflow",
  "champion",
]);

interface ZoneTileProps {
  zone: DeckZone;
  label: string;
  cards: DeckBuilderCard[];
  allCards: DeckBuilderCard[];
  expected: number | undefined;
  emptyHint: string;
  hasViolation: boolean;
  className?: string;
  onClick: () => void;
  onHoverCard?: (cardId: string | null) => void;
  getThumbnail: (cardId: string) => string | undefined;
}

function ZoneTile({
  zone,
  label,
  cards,
  allCards,
  expected,
  emptyHint,
  hasViolation,
  className,
  onClick,
  onHoverCard,
  getThumbnail,
}: ZoneTileProps) {
  const quantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const isEmpty = cards.length === 0;
  const isComplete = !hasViolation && expected !== undefined && quantity === expected;
  const isLandscape = LANDSCAPE_ZONES.has(zone);

  const sortedCards = cards.toSorted((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    return a.cardName.localeCompare(b.cardName);
  });

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
  const crossZoneTotal = (cardId: string) =>
    allCards
      .filter((entry) => entry.cardId === cardId && COPY_LIMIT_ZONES.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);

  const isZoneFull = (() => {
    if (!isDragging || !draggedCard) {
      return false;
    }
    if (COPY_LIMIT_ZONES.has(zone) && crossZoneTotal(draggedCard.cardId) >= 3) {
      return true;
    }
    if (zone === "battlefield") {
      return allCards.some(
        (card) => card.cardId === draggedCard.cardId && card.zone === "battlefield",
      );
    }
    if (zone === "runes") {
      const runeTotal = allCards
        .filter((card) => card.zone === "runes")
        .reduce((sum, card) => sum + card.quantity, 0);
      return runeTotal >= 12;
    }
    return false;
  })();

  const dropDisabled =
    isDragging &&
    draggedCard !== undefined &&
    (!isCardAllowedInZone(draggedCard, zone) || isZoneFull);

  const dropData: DeckDropData = { type: "deck-zone", zone };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `overview-zone-${zone}`,
    data: dropData,
    disabled: dropDisabled,
  });

  return (
    <button
      ref={dropRef}
      type="button"
      onClick={onClick}
      className={cn(
        "group bg-card flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
        "hover:border-primary/50 hover:bg-muted/40",
        hasViolation && "border-destructive/50",
        isOver && !dropDisabled && "ring-primary/60 ring-2",
        dropDisabled && "opacity-40",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {isComplete && <CheckCircle2Icon className="size-3.5 text-green-600 dark:text-green-500" />}
        {hasViolation && <AlertTriangleIcon className="text-destructive size-3.5" />}
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
        <p className="text-muted-foreground text-xs">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {sortedCards.map((card) => {
            const thumbnail = getThumbnail(card.cardId);
            if (!thumbnail) {
              return null;
            }
            return (
              <ZoneThumb
                key={card.cardId}
                card={card}
                zone={zone}
                thumbnail={thumbnail}
                isLandscape={isLandscape}
                onHoverCard={onHoverCard}
              />
            );
          })}
        </div>
      )}
    </button>
  );
}

function ZoneThumb({
  card,
  zone,
  thumbnail,
  isLandscape,
  onHoverCard,
}: {
  card: DeckBuilderCard;
  zone: DeckZone;
  thumbnail: string;
  isLandscape: boolean;
  onHoverCard?: (cardId: string | null) => void;
}) {
  const isMobile = useIsMobile();
  const enableDrag = !isMobile && DRAG_SOURCE_ZONES.has(zone);

  const dragData: DeckCardDragData = {
    type: "deck-card",
    cardId: card.cardId,
    cardName: card.cardName,
    fromZone: zone,
    quantity: card.quantity,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `overview-thumb-${card.cardId}-${zone}`,
    data: dragData,
    disabled: !enableDrag,
  });

  return (
    <div
      ref={enableDrag ? setNodeRef : undefined}
      className={cn(
        "relative shrink-0",
        enableDrag && "cursor-grab active:cursor-grabbing",
        isDragging && card.quantity === 1 && "opacity-40",
      )}
      onMouseEnter={() => onHoverCard?.(card.cardId)}
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
        <span className="bg-background/90 text-foreground absolute right-0.5 bottom-0.5 rounded px-1 text-[10px] leading-tight font-medium tabular-nums">
          ×{card.quantity}
        </span>
      )}
    </div>
  );
}
