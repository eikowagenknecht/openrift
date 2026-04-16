import type { DeckZone, Marketplace } from "@openrift/shared";
import { LayoutDashboardIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { DeckOwnershipPanel } from "@/components/deck/deck-ownership-panel";
import { DeckStatsPanel } from "@/components/deck/deck-stats-panel";
import { DeckZoneSection } from "@/components/deck/deck-zone-section";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useZoneOrder } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

interface DeckZonePanelProps {
  deckId: string;
  onZoneClick?: (zone: DeckZone) => void;
  onOverviewClick?: () => void;
  onHoverCard?: (cardId: string | null) => void;
  ownershipData?: DeckOwnershipData;
  marketplace?: Marketplace;
  onViewMissing?: () => void;
  hideStatsAndOwnership?: boolean;
}

export function DeckZonePanel({
  deckId,
  onZoneClick,
  onOverviewClick,
  onHoverCard,
  ownershipData,
  marketplace,
  onViewMissing,
  hideStatsAndOwnership,
}: DeckZonePanelProps) {
  const { zoneOrder } = useZoneOrder();
  const cards = useDeckCards(deckId);
  const { data: deckDetail } = useDeckDetail(deckId);
  const violations = useDeckViolations(deckId, deckDetail.deck.format);
  const activeZone = useDeckBuilderUiStore((state) => state.activeZone);

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

  const overviewActive = activeZone === null;

  return (
    <div className="flex flex-col gap-2">
      {onOverviewClick && (
        <button
          type="button"
          onClick={onOverviewClick}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
            overviewActive ? "bg-primary/10 font-bold" : "hover:bg-muted/50",
          )}
        >
          <LayoutDashboardIcon className="size-3.5" />
          <span>Overview</span>
        </button>
      )}
      {zoneOrder.map((zone) => (
        <DeckZoneSection
          key={zone}
          deckId={deckId}
          zone={zone}
          cards={cards.filter((card) => card.zone === zone)}
          violations={violations}
          isActive={activeZone === zone}
          shiftHeld={shiftHeld}
          onActivate={() => onZoneClick?.(zone)}
          onHoverCard={onHoverCard}
        />
      ))}
      {!hideStatsAndOwnership && (
        <>
          <DeckStatsPanel deckId={deckId} />
          {ownershipData && marketplace && onViewMissing && (
            <DeckOwnershipPanel
              data={ownershipData}
              marketplace={marketplace}
              onViewMissing={onViewMissing}
            />
          )}
        </>
      )}
    </div>
  );
}
