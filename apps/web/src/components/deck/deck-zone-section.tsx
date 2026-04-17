import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { CardType, DeckViolation, DeckZone } from "@openrift/shared";
import { AlertTriangleIcon, BanIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { DeckCardRow } from "@/components/deck/deck-card-row";
import type {
  BrowserCardDragData,
  DeckCardDragData,
  DeckDropData,
} from "@/components/deck/deck-dnd-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { isCardAllowedInZone } from "@/lib/deck-builder-card";
import { ZONE_LABELS } from "@/lib/deck-zone-labels";
import { getTypeIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

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

// Zones that only allow a single card — show remove button instead of +/-
const SINGLE_CARD_ZONES = new Set<DeckZone>(["legend", "champion"]);
const UNIQUE_ONLY_ZONES = new Set<DeckZone>(["battlefield"]);
// Zones where cards can be dragged between freely
const DRAG_ZONES = new Set<DeckZone>(["main", "sideboard", "overflow"]);
// Zones where cards are grouped by type with shared icons
const GROUPED_ZONES = new Set<DeckZone>(["main", "sideboard", "overflow"]);
// Display order for type groups in grouped zones
const TYPE_GROUP_ORDER: CardType[] = ["Unit", "Spell", "Gear"];

interface DeckZoneSectionProps {
  deckId: string;
  zone: DeckZone;
  cards: DeckBuilderCard[];
  violations: DeckViolation[];
  isActive: boolean;
  shiftHeld?: boolean;
  onActivate: () => void;
  onHoverCard?: (cardId: string | null) => void;
}

export function DeckZoneSection({
  deckId,
  zone,
  cards,
  violations,
  isActive,
  shiftHeld,
  onActivate,
  onHoverCard,
}: DeckZoneSectionProps) {
  const [open, setOpen] = useState(zone !== "sideboard" && zone !== "overflow");
  const { addCard, removeCard, setQuantity } = useDeckBuilderActions(deckId);
  const allCards = useDeckCards(deckId);
  const { getPreferredPrinting } = usePreferredPrinting();

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
    const match = getPreferredPrinting(card.cardId);
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
  // Only show zone-level violations when the zone has content — empty zones
  // use the hint text instead of screaming errors at an empty deck.
  const isEmpty = cards.length === 0;
  const hasZoneViolations = !isEmpty && zoneViolations.length > 0;
  const isSingleCard = SINGLE_CARD_ZONES.has(zone);
  const isUniqueOnly = UNIQUE_ONLY_ZONES.has(zone);
  const isGrouped = GROUPED_ZONES.has(zone);

  // Get legend domains for active zone tint — return the stable array from the card
  // or undefined (not a new []) to avoid infinite re-renders from Zustand
  const renderCardRow = (card: DeckBuilderCard) => (
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
          onHoverCard?.(null);
          setQuantity(card.cardId, zone, 0);
        } else if (card.quantity <= 1) {
          onHoverCard?.(null);
          removeCard(card.cardId, zone);
        } else {
          removeCard(card.cardId, zone);
        }
      }}
      onRemove={() => {
        onHoverCard?.(null);
        removeCard(card.cardId, zone);
      }}
      onClick={() => handleCardClick(card)}
      onHover={onHoverCard}
    />
  );

  const renderGroupedCards = () => {
    const grouped = Map.groupBy(cards, (card) => card.cardType);
    const sortedCards = (group: DeckBuilderCard[]) =>
      group.toSorted((a, b) => {
        const energyDiff = (a.energy ?? 0) - (b.energy ?? 0);
        if (energyDiff !== 0) {
          return energyDiff;
        }
        const powerDiff = (a.power ?? 0) - (b.power ?? 0);
        if (powerDiff !== 0) {
          return powerDiff;
        }
        return a.cardName.localeCompare(b.cardName);
      });

    return TYPE_GROUP_ORDER.filter((type) => grouped.has(type)).map((type) => {
      const group = sortedCards(grouped.get(type) ?? []);
      const groupQty = group.reduce((sum, card) => sum + card.quantity, 0);
      const typeIconPath = getTypeIconPath(type, []);
      return (
        <div key={type} className="flex">
          <div className="flex w-7 shrink-0 flex-col items-center pt-1.5">
            {typeIconPath && (
              <img src={typeIconPath} alt={type} className="size-3.5 brightness-0 dark:invert" />
            )}
            <span className="text-muted-foreground text-[10px]">{groupQty}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {group.map((card) => renderCardRow(card))}
          </div>
        </div>
      );
    });
  };

  return (
    <div
      ref={dropRef}
      className={cn(
        "overflow-hidden rounded-lg border transition-opacity select-none",
        isActive && "bg-primary/10",
        isOver && !dropDisabled && "ring-primary/60 ring-2",
        dropDisabled && "opacity-40",
      )}
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
          onClick={() => {
            if (!open) {
              setOpen(true);
            }
            onActivate();
          }}
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
            ) : null}
          </span>
          <span
            className={cn(
              "ml-auto text-xs",
              hasZoneViolations ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {totalQuantity}
            {expected !== null && expected !== undefined && `/${expected}`}
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t px-1 py-1">
          {cards.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-xs">{ZONE_EMPTY_HINTS[zone]}</p>
          ) : isGrouped ? (
            <div className="flex flex-col gap-1.5">{renderGroupedCards()}</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {cards.map((card) => {
                const typeIconPath = getTypeIconPath(card.cardType, card.superTypes);
                return (
                  <div key={`${card.cardId}-${card.zone}`} className="flex">
                    <div className="flex w-7 shrink-0 items-center justify-center">
                      {typeIconPath && (
                        <img
                          src={typeIconPath}
                          alt={card.cardType}
                          className="size-3.5 brightness-0 dark:invert"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">{renderCardRow(card)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
