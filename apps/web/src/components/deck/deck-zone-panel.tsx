import type { DeckFormat, DeckZone } from "@openrift/shared";
import { formatHasSideboard, imageUrl, WellKnown, legendDisplayName } from "@openrift/shared";
import { LayoutDashboardIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { DeckStatsPanel, DomainBar } from "@/components/deck/deck-stats-panel";
import { DeckZoneSection } from "@/components/deck/deck-zone-section";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckStats } from "@/hooks/use-deck-stats";
import { useDeckDetail } from "@/hooks/use-decks";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useZoneOrder } from "@/hooks/use-enums";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { requiredZoneProgress } from "@/lib/deck-zone-labels";
import { deckGlowStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

/**
 * With `onOverviewClick` this doubles as the way back to the overview, which
 * is why the Overview button below can hide once the overview is showing.
 */
function PanelIdentityHeader({
  name,
  format,
  cards,
  violationCount,
  onOverviewClick,
}: {
  name: string;
  format: DeckFormat;
  cards: DeckBuilderCard[];
  violationCount: number;
  onOverviewClick?: () => void;
}) {
  const domainColors = useDomainColors();
  const stats = useDeckStats(cards);
  const { getPreferredFrontImage } = usePreferredPrinting();
  const legend = cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const champion = cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  const legendDomains = legend?.domains ?? [];
  const { progress, total } = requiredZoneProgress(cards, format);
  const isFreeform = format === WellKnown.deckFormat.FREEFORM;
  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const isComplete = !isFreeform && progress === total && violationCount === 0;

  const legendImage = legend
    ? getPreferredFrontImage(legend.cardId, legend.preferredPrintingId)
    : undefined;
  const championImage = champion
    ? getPreferredFrontImage(champion.cardId, champion.preferredPrintingId)
    : undefined;

  const body = (
    <>
      <div className="absolute inset-0" style={deckGlowStyle(legendDomains, domainColors)} />
      <div className="relative flex items-center gap-2.5 p-2.5">
        <div className="relative h-11 w-14 shrink-0">
          {legendImage ? (
            <img
              src={imageUrl(legendImage.imageId, "120w")}
              alt={
                legend
                  ? legendDisplayName({
                      name: legend.cardName,
                      types: legend.cardTypes,
                      tags: legend.tags,
                    })
                  : "Legend"
              }
              style={{ borderRadius: CARD_BORDER_RADIUS }}
              className="aspect-card absolute top-1/2 left-0 h-11 -translate-y-1/2 -rotate-7 object-cover shadow-sm"
              draggable={false}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{ borderRadius: CARD_BORDER_RADIUS }}
              className="aspect-card border-muted-foreground/25 absolute top-1/2 left-0 h-11 -translate-y-1/2 -rotate-7 border border-dashed"
            />
          )}
          {championImage ? (
            <img
              src={imageUrl(championImage.imageId, "120w")}
              alt={champion?.cardName ?? "Champion"}
              style={{ borderRadius: CARD_BORDER_RADIUS }}
              className="aspect-card absolute top-1/2 right-0 h-11 -translate-y-1/2 rotate-7 object-cover shadow-sm"
              draggable={false}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{ borderRadius: CARD_BORDER_RADIUS }}
              className="aspect-card border-muted-foreground/25 absolute top-1/2 right-0 h-11 -translate-y-1/2 rotate-7 border border-dashed"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p
            className={cn(
              "text-xs tabular-nums",
              violationCount > 0
                ? "text-destructive"
                : isComplete
                  ? "text-success"
                  : "text-muted-foreground",
            )}
          >
            {isFreeform
              ? `${totalQuantity} ${totalQuantity === 1 ? "card" : "cards"}`
              : `${progress}/${total} cards`}
          </p>
        </div>
      </div>
      {/* No tooltips: the header itself is a button, so the segments stay
          decoration. */}
      <DomainBar
        data={stats.domainDistribution}
        total={stats.totalCards}
        colors={domainColors}
        interactive={false}
        className="relative h-0.5"
      />
    </>
  );

  const frame = "bg-card relative w-full overflow-hidden rounded-lg border";

  if (!onOverviewClick) {
    return <div className={frame}>{body}</div>;
  }

  return (
    <Pressable
      onClick={onOverviewClick}
      aria-label="Deck overview"
      className={cn(frame, "hover:bg-muted/50 transition-colors")}
    >
      {body}
    </Pressable>
  );
}

interface DeckZonePanelProps {
  deckId: string;
  onZoneClick?: (zone: DeckZone) => void;
  onOverviewClick?: () => void;
  onHoverCard?: HoverHandler;
  ownershipData?: DeckOwnershipData;
  hideStats?: boolean;
  overviewShowing?: boolean;
  deckItems: CardViewerItem[];
}

export function DeckZonePanel({
  deckId,
  onZoneClick,
  onOverviewClick,
  onHoverCard,
  ownershipData,
  hideStats,
  overviewShowing,
  deckItems,
}: DeckZonePanelProps) {
  const { zoneOrder } = useZoneOrder();
  const cards = useDeckCards(deckId);
  const { data: deckDetail } = useDeckDetail(deckId);
  const violations = useDeckViolations(
    deckId,
    deckDetail.deck.format,
    deckDetail.deck.formatConfig,
  );
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);

  // A non-empty sideboard (format switch, imported list) stays visible with
  // its violation so the cards can still be moved out.
  const visibleZones = zoneOrder.filter(
    (zone) =>
      zone !== WellKnown.deckZone.SIDEBOARD ||
      formatHasSideboard(deckDetail.deck.format) ||
      cards.some((card) => card.zone === WellKnown.deckZone.SIDEBOARD),
  );

  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setShiftHeld(false);
      }
    };
    globalThis.addEventListener("keydown", down);
    globalThis.addEventListener("keyup", up);
    return () => {
      globalThis.removeEventListener("keydown", down);
      globalThis.removeEventListener("keyup", up);
    };
  }, []);

  return (
    // gap-4 must clear the drop ring a section grows to while a card hovers over it.
    <div className="flex flex-col gap-4">
      <PanelIdentityHeader
        name={deckDetail.deck.name}
        format={deckDetail.deck.format}
        cards={cards}
        violationCount={violations.length}
        onOverviewClick={onOverviewClick}
      />
      {onOverviewClick && !overviewShowing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOverviewClick}
          className="h-auto justify-start gap-2 rounded-lg px-2.5 py-2 text-left"
        >
          <LayoutDashboardIcon className="size-3.5" />
          <span>Overview</span>
        </Button>
      )}
      {visibleZones.map((zone) => (
        <DeckZoneSection
          key={zone}
          deckId={deckId}
          zone={zone}
          cards={cards.filter((card) => card.zone === zone)}
          ownership={ownershipData}
          violations={violations}
          isActive={activeZone === zone}
          shiftHeld={shiftHeld}
          onActivate={() => onZoneClick?.(zone)}
          onHoverCard={onHoverCard}
          deckItems={deckItems}
        />
      ))}
      {/* No ownership breakdown here: the overview's hero carries the
          owned/missing counts and its Collection lens draws the same split. */}
      {!hideStats && <DeckStatsPanel deckId={deckId} />}
    </div>
  );
}
