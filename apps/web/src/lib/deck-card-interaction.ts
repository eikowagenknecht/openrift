import type { DeckZone } from "@openrift/shared";

import type { DeckCardDragData } from "@/components/deck/deck-dnd-context";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Click and keyboard wiring for a deck card rendered as a `div` — the overview's
 * thumbnails and its stacks-mode strips.
 *
 * Spread as one object rather than as conditional props: the static analyzer
 * needs `role`, `tabIndex` and the handlers to arrive together, or it reports a
 * `jsx-a11y/no-static-element-interactions` false positive on the element.
 *
 * @returns The interactive props, or nothing when the surface has no click
 *   target (read-only views without a detail pane).
 */
export function cardInteractiveProps(
  card: DeckBuilderCard,
  onCardClick?: (card: DeckBuilderCard) => void,
): React.HTMLAttributes<HTMLDivElement> {
  if (!onCardClick) {
    return {};
  }
  return {
    role: "button",
    tabIndex: 0,
    onClick: () => onCardClick(card),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onCardClick(card);
      }
    },
  };
}

/**
 * The drag payload a deck entry carries when picked up off the overview. The
 * ids identify the row it was lifted from (card, zone, printing), which is what
 * `resolveDraggedCard` looks the entry back up by.
 * @param displayName The name shown on the drag ghost — a legend's own name,
 *   not the card's, so it reads the way the thumb does.
 * @returns The payload for `useDraggable`'s `data`.
 */
export function deckCardDragData(
  card: DeckBuilderCard,
  zone: DeckZone,
  displayName: string,
): DeckCardDragData {
  return {
    type: "deck-card",
    cardId: card.cardId,
    cardName: displayName,
    fromZone: zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
  };
}
