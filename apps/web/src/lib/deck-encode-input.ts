import { legendDisplayName } from "@openrift/shared";

import type { EncodeDeckCardInput } from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export function toEncodeDeckCards(cards: DeckBuilderCard[]): EncodeDeckCardInput[] {
  return cards.map((card) => ({
    cardId: card.cardId,
    zone: card.zone,
    quantity: card.quantity,
    preferredPrintingId: card.preferredPrintingId,
    cardName: legendDisplayName({ name: card.cardName, types: card.cardTypes, tags: card.tags }),
    cardType: card.cardType,
    superTypes: card.superTypes,
    domains: card.domains,
  }));
}
