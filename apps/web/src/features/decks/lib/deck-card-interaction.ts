import type { DeckZone } from "@openrift/shared/types/enums";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import type { DeckCardDragData } from "@/features/decks/lib/deck-dnd-data";

/**
 * `role`, `tabIndex` and the handlers must be spread together as one object
 * or `jsx-a11y/no-static-element-interactions` false-positives on the element.
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

/** `resolveDraggedCard` looks the entry back up by the card/zone/printing ids. */
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
