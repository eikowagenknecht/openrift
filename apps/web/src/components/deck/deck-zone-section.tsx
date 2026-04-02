import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DeckViolation, DeckZone } from "@openrift/shared";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useState } from "react";

import { DeckCardRow } from "@/components/deck/deck-card-row";
import type {
  BrowserCardDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/components/deck/deck-dnd-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCards } from "@/hooks/use-cards";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { isCardAllowedInZone, useDeckBuilderStore } from "@/stores/deck-builder-store";
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
  shiftHeld?: boolean;
  onActivate: () => void;
}

export function DeckZoneSection({
  zone,
  cards,
  violations,
  isActive,
  shiftHeld,
  onActivate,
}: DeckZoneSectionProps) {
  const [open, setOpen] = useState(true);
  const removeCard = useDeckBuilderStore((state) => state.removeCard);
  const addCard = useDeckBuilderStore((state) => state.addCard);
  const setQuantity = useDeckBuilderStore((state) => state.setQuantity);
  const allCards = useDeckBuilderStore((state) => state.cards);
  const { allPrintings } = useCards();

  // Check if the currently dragged card is allowed in this zone
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

  // Cross-zone copy totals — champion zone counts toward the 3-copy limit too
  const copyLimitZones = new Set(["main", "sideboard", "overflow", "champion"]);
  const crossZoneTotal = (cardId: string) =>
    allCards
      .filter((entry) => entry.cardId === cardId && copyLimitZones.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);

  // Determine if this zone should reject the currently dragged card
  const isZoneFull = (() => {
    if (!isDragging || !draggedCard) {
      return false;
    }
    if (copyLimitZones.has(zone) && crossZoneTotal(draggedCard.cardId) >= 3) {
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
    id: `deck-zone-${zone}`,
    data: dropData,
    disabled: dropDisabled,
  });

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
        "overflow-hidden rounded-lg border transition-opacity",
        isActive && !activeTintStyle && "bg-primary/10",
        isOver && !dropDisabled && "ring-primary/60 ring-2",
        dropDisabled && "opacity-40",
      )}
      style={activeTintStyle}
    >
      <div className="flex items-center px-1 py-1">
        <button
          type="button"
          className="hover:bg-muted/50 flex size-5 shrink-0 items-center justify-center rounded"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-1.5 py-1 text-left text-sm"
          onClick={onActivate}
        >
          <span className={cn("flex items-center gap-1", isActive && "font-bold")}>
            {ZONE_LABELS[zone]}
            {dropDisabled ? (
              <BanIcon className="text-muted-foreground size-3.5" />
            ) : hasZoneViolations ? (
              <Tooltip>
                <TooltipTrigger render={<span />}>
                  <AlertTriangleIcon className="text-destructive size-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  {zoneViolations.map((violation) => violation.message).join(". ")}
                </TooltipContent>
              </Tooltip>
            ) : cards.length > 0 || zone === "overflow" || zone === "sideboard" ? (
              <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
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
                shiftHeld={zone === "runes" ? undefined : shiftHeld}
                onIncrement={
                  copyLimitZones.has(zone) && crossZoneTotal(card.cardId) >= 3
                    ? undefined
                    : (event) => addCard(card, zone, event.shiftKey ? 3 : undefined)
                }
                onDecrement={(event) => {
                  if (event.shiftKey) {
                    setQuantity(card.cardId, zone, 0);
                  } else {
                    removeCard(card.cardId, zone);
                  }
                }}
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
