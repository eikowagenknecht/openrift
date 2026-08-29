import { legendDisplayName } from "@openrift/shared";

import type { EncodeDeckCardInput } from "@/hooks/use-decks";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Map builder cards to the payload for the public deck-code encoder (ADR-035).
 * The server resolves canonical short codes; the client supplies identity, zone,
 * quantity, and the supertype/domain/name metadata it already holds.
 *
 * @returns Card rows ready to POST to the encode endpoint.
 */
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
