import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { DeckViolation, DeckZone } from "@openrift/shared";
import { WellKnown, copyLimitFor } from "@openrift/shared";
import { AlertTriangleIcon, BanIcon } from "lucide-react";
import { useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import { DeckCardRow } from "@/components/deck/deck-card-row";
import type { AnyDragData, DeckDropData } from "@/components/deck/deck-dnd-context";
import { DECK_DRAG_TYPES, resolveDraggedCard } from "@/components/deck/deck-dnd-context";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { canAddRune, useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { lockedReasonText } from "@/hooks/use-deck-ownership";
import { useDeckDetail } from "@/hooks/use-decks";
import { useBorrowedLenders } from "@/hooks/use-loans";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  getDeckCardKey,
  isCardAllowedInZone,
  isDeckZoneFullForDrag,
} from "@/lib/deck-builder-card";
import { compareGroupedCards, GROUPED_ZONES, TYPE_GROUP_ORDER } from "@/lib/deck-card-order";
import { ZONE_LABELS, zoneEmptyHint, zoneExpected } from "@/lib/deck-zone-labels";
import { asDragData } from "@/lib/dnd-data";
import { getTypeIconPath, getTypeIconPaths } from "@/lib/icons";
import { borrowedReasonText } from "@/lib/loan-derivation";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

// Zones that only allow a single card — show remove button instead of +/-
const SINGLE_CARD_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
]);
const UNIQUE_ONLY_ZONES = new Set<DeckZone>([WellKnown.deckZone.BATTLEFIELD]);
// Zones whose rows can be picked up and dragged out. Drop-target validity is
// gated separately (see deck-dnd-context.tsx + isCardAllowedInZone).
const DRAG_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
  WellKnown.deckZone.CHAMPION,
]);

interface DeckZoneSectionProps {
  deckId: string;
  zone: DeckZone;
  cards: DeckBuilderCard[];
  /** Per-card ownership — rows show an amber owned/needed fraction when short. */
  ownership?: DeckOwnershipData;
  violations: DeckViolation[];
  isActive: boolean;
  shiftHeld?: boolean;
  onActivate: () => void;
  onHoverCard?: (cardId: string | null, preferredPrintingId?: string | null) => void;
  /** Full deck-items list (across all zones), used to seed the detail pane's
   * prev/next navigation when a row is clicked. */
  deckItems: CardViewerItem[];
}

export function DeckZoneSection({
  deckId,
  zone,
  cards,
  ownership,
  violations,
  isActive,
  shiftHeld,
  onActivate,
  onHoverCard,
  deckItems,
}: DeckZoneSectionProps) {
  const [open, setOpen] = useState(
    zone !== WellKnown.deckZone.SIDEBOARD && zone !== WellKnown.deckZone.OVERFLOW,
  );
  const { addCard, removeCard, setQuantity } = useDeckBuilderActions(deckId);
  const allCards = useDeckCards(deckId);
  const { data: deckDetail } = useDeckDetail(deckId);
  const format = deckDetail.deck.format;
  const isFreeform = format === WellKnown.deckFormat.FREEFORM;
  const { getPreferredPrinting } = usePreferredPrinting();
  // Names only — the counts come from the ownership entry, which has already
  // allocated each borrowed copy to the zone that needs it.
  const { data: borrowedLenders } = useBorrowedLenders();

  // Check if the currently dragged card is allowed in this zone
  const { active } = useDndContext();
  const dragData = asDragData<AnyDragData>(active?.data.current, DECK_DRAG_TYPES);
  const draggedCard = resolveDraggedCard(dragData, allCards);
  const isDragging = active !== null;

  // Cross-zone copy totals — champion counts toward the 3-copy limit too;
  // overflow is excluded since it is a free parking zone with no copy cap.
  const copyLimitZones = new Set<DeckZone>([
    WellKnown.deckZone.MAIN,
    WellKnown.deckZone.SIDEBOARD,
    WellKnown.deckZone.CHAMPION,
  ]);
  const crossZoneTotal = (cardId: string) =>
    allCards
      .filter((entry) => entry.cardId === cardId && copyLimitZones.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);

  // Determine if this zone should reject the currently dragged card
  const isZoneFull =
    isDragging && draggedCard
      ? isDeckZoneFullForDrag({
          zone,
          draggedCard,
          fromZone: dragData?.type === "deck-card" ? dragData.fromZone : null,
          allCards,
          format,
        })
      : false;

  const dropDisabled =
    isDragging &&
    draggedCard !== undefined &&
    (!isCardAllowedInZone(draggedCard, zone) || isZoneFull);

  // Keep the zone registered as a droppable even when it can't accept the card,
  // and carry that state in the drop data instead of via `disabled`. A disabled
  // droppable drops out of collision detection, so a release over it would read
  // as "dropped outside any zone" and remove a copy; registering it lets
  // handleDragEnd treat the drop as a no-op. The visual state below is still
  // gated on `dropDisabled`, so an invalid zone shows no drop highlight.
  const dropData: DeckDropData = { type: "deck-zone", zone, disabled: dropDisabled };
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `deck-zone-${zone}`,
    data: dropData,
  });

  const handleCardClick = (card: DeckBuilderCard) => {
    const match = getPreferredPrinting(card.cardId, card.preferredPrintingId);
    if (match) {
      useSelectionStore.getState().selectCard(match, deckItems, "card");
    }
  };

  // Expand (if collapsed) and make this the active zone. Shared by the zone
  // header and the empty-state hint so both behave identically.
  const activateZone = () => {
    if (!open) {
      setOpen(true);
    }
    onActivate();
  };

  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const maxCardQuantity = cards.reduce((max, card) => Math.max(max, card.quantity), 0);
  // Freeform has no per-zone target — hide the "x/N" denominator entirely.
  // zoneExpected applies the format overrides (Custom-Region's single
  // battlefield, no /8 target on sideboard-less formats).
  const expected = isFreeform ? undefined : zoneExpected(zone, format);
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
  // In freeform, legend/champion are multi-card and battlefields aren't unique.
  const isSingleCard = SINGLE_CARD_ZONES.has(zone) && !isFreeform;
  const isUniqueOnly = UNIQUE_ONLY_ZONES.has(zone) && !isFreeform;
  const isGrouped = GROUPED_ZONES.has(zone);

  // Get legend domains for active zone tint — return the stable array from the card
  // or undefined (not a new []) to avoid infinite re-renders from Zustand
  const renderCardRow = (card: DeckBuilderCard) => {
    const entry = ownership?.byCardZone.get(`${card.cardId}:${zone}`);
    return (
      <DeckCardPrintingMenu key={getDeckCardKey(card)} deckId={deckId} card={card}>
        <DeckCardRow
          card={card}
          hasViolation={cardViolations.has(card.cardId)}
          violationMessage={cardViolations.get(card.cardId)}
          shortfall={entry?.shortfall}
          locked={entry?.locked}
          lockedReason={entry && entry.locked > 0 ? lockedReasonText(entry) : undefined}
          borrowed={entry?.borrowed}
          borrowedReason={
            entry && entry.borrowed > 0
              ? borrowedReasonText(entry.borrowed, borrowedLenders?.[card.cardId] ?? [])
              : undefined
          }
          controlMode={isSingleCard || isUniqueOnly ? "remove-only" : "quantity"}
          maxQuantity={maxCardQuantity}
          draggable={DRAG_ZONES.has(zone)}
          shiftHeld={zone === WellKnown.deckZone.RUNES ? undefined : shiftHeld}
          onIncrement={
            !isFreeform &&
            ((copyLimitZones.has(zone) && crossZoneTotal(card.cardId) >= copyLimitFor(card)) ||
              (zone === WellKnown.deckZone.RUNES && !canAddRune(card, allCards)))
              ? undefined
              : (event) => addCard(card, zone, event.shiftKey ? 3 : undefined)
          }
          onDecrement={(event) => {
            if (event.shiftKey) {
              onHoverCard?.(null);
              setQuantity(card.cardId, zone, 0, card.preferredPrintingId);
            } else if (card.quantity <= 1) {
              onHoverCard?.(null);
              removeCard(card.cardId, zone, card.preferredPrintingId);
            } else {
              removeCard(card.cardId, zone, card.preferredPrintingId);
            }
          }}
          onRemove={() => {
            onHoverCard?.(null);
            removeCard(card.cardId, zone, card.preferredPrintingId);
          }}
          onClick={() => handleCardClick(card)}
          onHover={onHoverCard}
        />
      </DeckCardPrintingMenu>
    );
  };

  const renderGroupedCards = () => {
    const grouped = Map.groupBy(cards, (card) => card.cardType);

    return TYPE_GROUP_ORDER.filter((type) => grouped.has(type)).map((type) => {
      const group = (grouped.get(type) ?? []).toSorted(compareGroupedCards);
      const groupQty = group.reduce((sum, card) => sum + card.quantity, 0);
      const typeIconPath = getTypeIconPath(type, []);
      return (
        <div key={type} className="flex">
          <div className="flex w-7 shrink-0 flex-col items-center pt-1.5">
            {typeIconPath && (
              <img src={typeIconPath} alt={type} className="size-3.5 brightness-0 dark:invert" />
            )}
            <span className="text-muted-foreground text-2xs">{groupQty}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {group.map((card) => renderCardRow(card))}
          </div>
        </div>
      );
    });
  };

  const zoneLabel = ZONE_LABELS[zone];

  return (
    <div
      ref={dropRef}
      className={cn(
        // Frameless: no box. The drop highlight is a ring around the whole
        // block, since there's no border left to recolor.
        "flex flex-col gap-1.5 rounded transition-all select-none",
        isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-2",
        dropDisabled && "opacity-40",
      )}
    >
      {/* Same header grammar as the deck overview's zones: a small-caps label
          over a hairline rule. The active zone recolors that rule instead of
          tinting a box. Two separate controls, never nested: the chevron
          collapses the section, the label opens the zone in the main area. */}
      <div className={cn("flex h-6 items-center gap-1.5 border-b", isActive && "border-primary")}>
        <ExpandToggle
          expanded={open}
          chevronClassName="size-3.5"
          aria-label={`${open ? "Collapse" : "Expand"} ${zoneLabel}`}
          onClick={() => setOpen((prev) => !prev)}
          className="shrink-0"
        />
        <Pressable
          onClick={activateZone}
          aria-label={`Edit ${zoneLabel}`}
          className={cn(
            "text-muted-foreground hover:text-foreground text-2xs min-w-0 flex-1 truncate font-semibold tracking-widest uppercase transition-colors",
            isActive && "text-foreground",
          )}
        >
          {zoneLabel}
        </Pressable>
        {dropDisabled ? (
          <BanIcon className="text-muted-foreground size-3.5 shrink-0" />
        ) : hasZoneViolations ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Show zone issues"
                  className="size-5 shrink-0 rounded"
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
        ) : null}
        <span
          className={cn(
            "ml-auto text-xs tabular-nums",
            hasZoneViolations
              ? "text-destructive"
              : expected !== undefined && totalQuantity === expected
                ? "text-green-600 dark:text-green-500"
                : "text-muted-foreground",
          )}
        >
          {totalQuantity}
          {expected !== null && expected !== undefined && `/${expected}`}
        </span>
      </div>

      {open &&
        (cards.length === 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground h-auto w-full justify-start rounded py-1 text-left font-normal whitespace-normal"
            onClick={activateZone}
          >
            {zoneEmptyHint(zone, format)}
          </Button>
        ) : isGrouped ? (
          <div className="flex flex-col gap-1.5">{renderGroupedCards()}</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {cards.map((card) => {
              const typeIconPaths = getTypeIconPaths(card.cardTypes, card.superTypes);
              return (
                <div key={getDeckCardKey(card)} className="flex">
                  <div className="flex w-7 shrink-0 flex-wrap items-center justify-center gap-0.5">
                    {typeIconPaths.map((path) => (
                      <img
                        key={path}
                        src={path}
                        alt={card.cardTypes.join(" ")}
                        className="size-3.5 brightness-0 dark:invert"
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">{renderCardRow(card)}</div>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
