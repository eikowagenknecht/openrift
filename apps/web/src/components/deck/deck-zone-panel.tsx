import type { DeckZone, Marketplace } from "@openrift/shared";
import { useEffect, useState } from "react";

import { DeckOwnershipPanel } from "@/components/deck/deck-ownership-panel";
import { DeckStatsPanel } from "@/components/deck/deck-stats-panel";
import { DeckZoneSection } from "@/components/deck/deck-zone-section";
import { useDeckCards, useDeckViolations } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useZoneOrder } from "@/hooks/use-enums";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";

interface DeckZonePanelProps {
  deckId: string;
  onZoneClick?: (zone: DeckZone) => void;
  onHoverCard?: (cardId: string | null) => void;
  ownershipData?: DeckOwnershipData;
  marketplace?: Marketplace;
  onViewMissing?: () => void;
}

export function DeckZonePanel({
  deckId,
  onZoneClick,
  onHoverCard,
  ownershipData,
  marketplace,
  onViewMissing,
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

  return (
    <div className="flex flex-col gap-2">
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
      <DeckStatsPanel deckId={deckId} />
      {ownershipData && marketplace && onViewMissing && (
        <DeckOwnershipPanel
          data={ownershipData}
          marketplace={marketplace}
          onViewMissing={onViewMissing}
        />
      )}
    </div>
  );
}
