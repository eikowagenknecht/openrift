import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface DeckCardDragData {
  type: "deck-card";
  cardId: string;
  cardName: string;
  fromZone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

export interface BrowserCardDragData {
  type: "browser-card";
  card: DeckBuilderCard;
}

export interface DeckDropData {
  type: "deck-zone";
  zone: DeckZone;
  disabled?: boolean;
}

export type AnyDragData = DeckCardDragData | BrowserCardDragData;

/** For narrowing a dnd-kit payload with {@link asDragData}; the deck editor's own sortables produce payloads outside this list. */
export const DECK_DRAG_TYPES = [
  "deck-card",
  "browser-card",
] as const satisfies readonly AnyDragData["type"][];

export const DECK_DROP_TYPES = ["deck-zone"] as const satisfies readonly DeckDropData["type"][];

export const DRAG_SOURCE_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
]);

/** Looked up by the row's full key (card, zone, printing): a deck can hold one card in one zone twice under different printings, as separate rows. */
export function resolveDraggedCard(
  dragData: AnyDragData | undefined,
  allCards: readonly DeckBuilderCard[],
): DeckBuilderCard | undefined {
  if (dragData?.type === "browser-card") {
    return dragData.card;
  }
  if (dragData?.type === "deck-card") {
    return allCards.find(
      (card) =>
        card.cardId === dragData.cardId &&
        card.zone === dragData.fromZone &&
        card.preferredPrintingId === dragData.preferredPrintingId,
    );
  }
  return undefined;
}

// Champion is included so a unit can be dragged into the chosen-champion slot; the move action handles replacing whatever's there.
const DRAG_ZONES = new Set<DeckZone>([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
  WellKnown.deckZone.CHAMPION,
]);

export function isDropRejected(activeData: AnyDragData, overData: DeckDropData): boolean {
  if (overData.disabled === true) {
    return true;
  }
  return (
    activeData.type === "deck-card" &&
    (activeData.fromZone === overData.zone || !DRAG_ZONES.has(overData.zone))
  );
}
