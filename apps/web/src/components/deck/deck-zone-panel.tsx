import type { DeckZone } from "@openrift/shared";

import { DeckStatsPanel } from "@/components/deck/deck-stats-panel";
import { DeckZoneSection } from "@/components/deck/deck-zone-section";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

const ZONE_ORDER: DeckZone[] = [
  "legend",
  "champion",
  "battlefield",
  "runes",
  "main",
  "sideboard",
  "overflow",
];

interface DeckZonePanelProps {
  onZoneClick?: (zone: DeckZone) => void;
}

export function DeckZonePanel({ onZoneClick }: DeckZonePanelProps) {
  const cards = useDeckBuilderStore((state) => state.cards);
  const violations = useDeckBuilderStore((state) => state.violations);
  const activeZone = useDeckBuilderStore((state) => state.activeZone);

  return (
    <div className="flex flex-col gap-2">
      {ZONE_ORDER.map((zone) => (
        <DeckZoneSection
          key={zone}
          zone={zone}
          cards={cards.filter((card) => card.zone === zone)}
          violations={violations}
          isActive={activeZone === zone}
          onActivate={() => onZoneClick?.(zone)}
        />
      ))}
      <DeckStatsPanel />
    </div>
  );
}
