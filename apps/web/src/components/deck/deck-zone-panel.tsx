import type { DeckZone, Marketplace } from "@openrift/shared";
import { useEffect, useState } from "react";

import { DeckOwnershipPanel } from "@/components/deck/deck-ownership-panel";
import { DeckStatsPanel } from "@/components/deck/deck-stats-panel";
import { DeckZoneSection } from "@/components/deck/deck-zone-section";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useZoneOrder } from "@/hooks/use-enums";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

interface DeckZonePanelProps {
  onZoneClick?: (zone: DeckZone) => void;
  onHoverCard?: (cardId: string | null) => void;
  ownershipData?: DeckOwnershipData;
  marketplace?: Marketplace;
  onViewMissing?: () => void;
}

export function DeckZonePanel({
  onZoneClick,
  onHoverCard,
  ownershipData,
  marketplace,
  onViewMissing,
}: DeckZonePanelProps) {
  const { zoneOrder } = useZoneOrder();
  const cards = useDeckBuilderStore((state) => state.cards);
  const violations = useDeckBuilderStore((state) => state.violations);
  const activeZone = useDeckBuilderStore((state) => state.activeZone);

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
          zone={zone}
          cards={cards.filter((card) => card.zone === zone)}
          violations={violations}
          isActive={activeZone === zone}
          shiftHeld={shiftHeld}
          onActivate={() => onZoneClick?.(zone)}
          onHoverCard={onHoverCard}
        />
      ))}
      <DeckStatsPanel />
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
