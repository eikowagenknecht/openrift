import { useDroppable } from "@dnd-kit/core";
import type { DeckViolation, DeckZone } from "@openrift/shared";
import { AlertTriangle, Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { DeckCardRow } from "@/components/deck/deck-card-row";
import type { DeckDropData } from "@/components/deck/deck-dnd-context";
import { useCards } from "@/hooks/use-cards";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";
import { useSelectionStore } from "@/stores/selection-store";

const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "Runes",
  battlefield: "Battlefields",
  main: "Main Deck",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

const ZONE_EXPECTED: Partial<Record<DeckZone, number>> = {
  legend: 1,
  champion: 1,
  runes: 12,
  battlefield: 3,
};

const ZONE_EMPTY_HINTS: Record<DeckZone, string> = {
  legend: "Find a Legend card and click Choose to set it",
  champion: "Pick a Champion that matches your Legend",
  runes: "Runes auto-fill when you set a Legend",
  battlefield: "Choose 3 unique Battlefield cards",
  main: "Click + on cards in the browser to add them",
  sideboard: "Add up to 8 sideboard cards",
  overflow: "Stash extra cards here while you decide",
};

// Zones that only allow a single card — show remove button instead of +/-
const SINGLE_CARD_ZONES = new Set<DeckZone>(["legend", "champion"]);
const UNIQUE_ONLY_ZONES = new Set<DeckZone>(["battlefield"]);
// Zones where cards can be dragged between freely
const DRAG_ZONES = new Set<DeckZone>(["main", "sideboard", "overflow"]);

interface DeckZoneSectionProps {
  zone: DeckZone;
  cards: DeckBuilderCard[];
  violations: DeckViolation[];
  isActive: boolean;
  onActivate: () => void;
}

export function DeckZoneSection({
  zone,
  cards,
  violations,
  isActive,
  onActivate,
}: DeckZoneSectionProps) {
  const [open, setOpen] = useState(true);
  const removeCard = useDeckBuilderStore((state) => state.removeCard);
  const addCard = useDeckBuilderStore((state) => state.addCard);
  const allCards = useDeckBuilderStore((state) => state.cards);
  const { allPrintings } = useCards();

  const dropData: DeckDropData = { type: "deck-zone", zone };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `deck-zone-${zone}`,
    data: dropData,
  });

  // Cross-zone copy totals for main/sideboard/overflow
  const copyLimitZones = new Set(["main", "sideboard", "overflow"]);
  const crossZoneTotal = (cardId: string) =>
    allCards
      .filter((entry) => entry.cardId === cardId && copyLimitZones.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);

  const handleCardClick = (card: DeckBuilderCard) => {
    const match = allPrintings.find((entry) => entry.card.id === card.cardId);
    if (match) {
      useSelectionStore.getState().selectCard(match, [], "card");
    }
  };

  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const expected = ZONE_EXPECTED[zone];
  const zoneViolations = violations.filter(
    (violation) => violation.zone === zone && !violation.cardId,
  );
  const cardViolations = new Map<string, string>();
  for (const violation of violations) {
    if (violation.zone === zone && violation.cardId && !cardViolations.has(violation.cardId)) {
      cardViolations.set(violation.cardId, violation.message);
    }
  }
  const hasZoneViolations = zoneViolations.length > 0;
  const isSingleCard = SINGLE_CARD_ZONES.has(zone);
  const isUniqueOnly = UNIQUE_ONLY_ZONES.has(zone);

  // Get legend domains for active zone tint — return the stable array from the card
  // or undefined (not a new []) to avoid infinite re-renders from Zustand
  const legendDomains = useDeckBuilderStore(
    (state) => state.cards.find((card) => card.zone === "legend")?.domains,
  );
  const activeTintStyle =
    isActive && legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "38")
      : undefined;

  return (
    <div
      ref={dropRef}
      className={cn(
        "overflow-hidden rounded-lg border",
        isActive && !activeTintStyle && "bg-primary/10",
        isOver && "ring-primary/60 ring-2",
      )}
      style={activeTintStyle}
    >
      <div className="flex items-center px-1 py-1">
        <button
          type="button"
          className="hover:bg-muted/50 flex size-5 shrink-0 items-center justify-center rounded"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-1.5 py-1 text-left text-sm"
          onClick={onActivate}
        >
          <span className={cn("flex items-center gap-1", isActive && "font-bold")}>
            {ZONE_LABELS[zone]}
            {hasZoneViolations ? (
              <AlertTriangle className="text-destructive size-3.5" />
            ) : cards.length > 0 || zone === "overflow" || zone === "sideboard" ? (
              <Check className="size-3.5 text-green-600 dark:text-green-400" />
            ) : null}
          </span>
          <span className="text-muted-foreground ml-auto text-xs">
            {totalQuantity}
            {expected !== null && expected !== undefined && `/${expected}`}
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t py-1">
          {cards.length === 0 ? (
            <p className="text-muted-foreground px-3 py-1 text-xs">{ZONE_EMPTY_HINTS[zone]}</p>
          ) : (
            cards.map((card) => (
              <DeckCardRow
                key={`${card.cardId}-${card.zone}`}
                card={card}
                hasViolation={cardViolations.has(card.cardId)}
                violationMessage={cardViolations.get(card.cardId)}
                controlMode={isSingleCard || isUniqueOnly ? "remove-only" : "quantity"}
                draggable={DRAG_ZONES.has(zone)}
                onIncrement={
                  copyLimitZones.has(zone) && crossZoneTotal(card.cardId) >= 3
                    ? undefined
                    : () => addCard(card, zone)
                }
                onDecrement={() => removeCard(card.cardId, zone)}
                onRemove={() => removeCard(card.cardId, zone)}
                onClick={() => handleCardClick(card)}
              />
            ))
          )}

          {zoneViolations.length > 0 && (
            <div className="text-destructive px-2 py-1 text-xs">
              {zoneViolations.map((violation) => (
                <p key={violation.code}>{violation.message}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
