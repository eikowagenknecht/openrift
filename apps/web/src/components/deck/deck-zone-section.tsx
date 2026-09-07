import type { DeckViolation, DeckZone } from "@openrift/shared";
import { WellKnown, copyLimitFor } from "@openrift/shared";
import { AlertTriangleIcon, BanIcon } from "lucide-react";
import { useState } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { DeckCardPrintingMenu } from "@/components/deck/deck-card-printing-menu";
import { DeckCardRow } from "@/components/deck/deck-card-row";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { canAddRune, useDeckBuilderActions, useDeckCards } from "@/hooks/use-deck-builder";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { lockedReasonText } from "@/hooks/use-deck-ownership";
import { useDeckZoneDrop } from "@/hooks/use-deck-zone-drop";
import { useDeckDetail } from "@/hooks/use-decks";
import { useBorrowedLenders } from "@/hooks/use-loans";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { HoverHandler } from "@/lib/card-row-interactions";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { compareGroupedCards, GROUPED_ZONES, TYPE_GROUP_ORDER } from "@/lib/deck-card-order";
import { ZONE_LABELS, zoneEmptyHint, zoneExpected } from "@/lib/deck-zone-labels";
import { getTypeIconPath, getTypeIconPaths } from "@/lib/icons";
import { borrowedReasonText } from "@/lib/loan-derivation";
import { cn } from "@/lib/utils";
import { useSelectionStore } from "@/stores/selection-store";

const SINGLE_CARD_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.LEGEND,
  WellKnown.deckZone.CHAMPION,
]);
const UNIQUE_ONLY_ZONES = new Set<DeckZone>([WellKnown.deckZone.BATTLEFIELD]);
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
  ownership?: DeckOwnershipData;
  violations: DeckViolation[];
  isActive: boolean;
  shiftHeld?: boolean;
  onActivate: () => void;
  onHoverCard?: HoverHandler;
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
  const { data: borrowedLenders } = useBorrowedLenders();

  // Champion counts toward the 3-copy limit too; overflow is excluded since
  // it is a free parking zone with no copy cap.
  const copyLimitZones = new Set<DeckZone>([
    WellKnown.deckZone.MAIN,
    WellKnown.deckZone.SIDEBOARD,
    WellKnown.deckZone.CHAMPION,
  ]);
  const crossZoneTotal = (cardId: string) =>
    allCards
      .filter((entry) => entry.cardId === cardId && copyLimitZones.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);

  // The same hook the overview's zone tiles use, so the two reject the same drags.
  const { dropRef, isOver, dropDisabled } = useDeckZoneDrop({
    id: `deck-zone-${zone}`,
    zone,
    allCards,
    format,
  });

  const handleCardClick = (card: DeckBuilderCard) => {
    const match = getPreferredPrinting(card.cardId, card.preferredPrintingId);
    if (match) {
      useSelectionStore.getState().selectCard(match, deckItems, "card");
    }
  };

  const activateZone = () => {
    if (!open) {
      setOpen(true);
    }
    onActivate();
  };

  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0);
  const maxCardQuantity = cards.reduce((max, card) => Math.max(max, card.quantity), 0);
  // Freeform has no per-zone target — hide the "x/N" denominator entirely.
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
  const isEmpty = cards.length === 0;
  const hasZoneViolations = !isEmpty && zoneViolations.length > 0;
  // In freeform, legend/champion are multi-card and battlefields aren't unique.
  const isSingleCard = SINGLE_CARD_ZONES.has(zone) && !isFreeform;
  const isUniqueOnly = UNIQUE_ONLY_ZONES.has(zone) && !isFreeform;
  const isGrouped = GROUPED_ZONES.has(zone);

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
        "flex flex-col gap-1.5 rounded-md transition-all select-none",
        isOver && !dropDisabled && "ring-primary/60 ring-2 ring-offset-2",
        dropDisabled && "opacity-40",
      )}
    >
      {/* Two separate controls, never nested: the chevron collapses the
          section, the label opens the zone in the main area. */}
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
            "text-muted-foreground hover:text-foreground text-2xs min-w-0 flex-1 truncate font-semibold tracking-wide uppercase transition-colors",
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
                  className="size-5 shrink-0 rounded-md"
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
                ? "text-success"
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
            className="text-muted-foreground h-auto w-full justify-start rounded-md py-1 text-left font-normal whitespace-normal"
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
