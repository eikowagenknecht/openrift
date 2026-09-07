import type { CardType, DeckZone, Domain, SuperType } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface EncodeDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
}

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
