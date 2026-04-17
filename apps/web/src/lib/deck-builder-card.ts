import type {
  Card,
  CardType,
  DeckCardResponse,
  DeckZone,
  Domain,
  SuperType,
} from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

const EMPTY_ARRAY: string[] = [];

export interface DeckBuilderCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  /** Printing pinned for display, or null for "default art". */
  preferredPrintingId: string | null;
  cardName: string;
  cardType: CardType;
  superTypes: SuperType[];
  domains: Domain[];
  tags: string[];
  keywords: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
}

export function deckCardKey(
  cardId: string,
  zone: DeckZone,
  preferredPrintingId: string | null,
): string {
  return `${cardId}|${zone}|${preferredPrintingId ?? ""}`;
}

export function getDeckCardKey(card: {
  cardId: string;
  zone: DeckZone;
  preferredPrintingId: string | null;
}): string {
  return deckCardKey(card.cardId, card.zone, card.preferredPrintingId);
}

/**
 * Checks whether a card is allowed in a given zone based on its type/supertypes.
 *
 * @returns true if the card's type is valid for the zone
 */
export function isCardAllowedInZone(
  card: { cardType: CardType; superTypes: SuperType[] },
  zone: DeckZone,
): boolean {
  switch (zone) {
    case WellKnown.deckZone.LEGEND: {
      return card.cardType === WellKnown.cardType.LEGEND;
    }
    case WellKnown.deckZone.CHAMPION: {
      return (
        card.superTypes.includes(WellKnown.superType.CHAMPION) &&
        card.cardType !== WellKnown.cardType.LEGEND
      );
    }
    case WellKnown.deckZone.RUNES: {
      return card.cardType === WellKnown.cardType.RUNE;
    }
    case WellKnown.deckZone.BATTLEFIELD: {
      return card.cardType === WellKnown.cardType.BATTLEFIELD;
    }
    case WellKnown.deckZone.MAIN:
    case WellKnown.deckZone.SIDEBOARD:
    case WellKnown.deckZone.OVERFLOW: {
      return (
        card.cardType !== WellKnown.cardType.LEGEND &&
        card.cardType !== WellKnown.cardType.RUNE &&
        card.cardType !== WellKnown.cardType.BATTLEFIELD
      );
    }
    default: {
      return false;
    }
  }
}

export function catalogCardToDeckBuilderCard(cardId: string, card: Card): DeckBuilderCard {
  return {
    cardId,
    zone: "main",
    quantity: 1,
    preferredPrintingId: null,
    cardName: card.name,
    cardType: card.type,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags,
    keywords: card.keywords,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}

/**
 * Converts an API DeckCardResponse to a DeckBuilderCard by resolving card
 * metadata from the catalog.
 * @returns A DeckBuilderCard with full card data, or null if card not found.
 */
export function toDeckBuilderCard(
  deckCard: DeckCardResponse,
  cardsById: Record<string, Card>,
): DeckBuilderCard | null {
  const card = cardsById[deckCard.cardId];
  if (!card) {
    return null;
  }
  return {
    cardId: deckCard.cardId,
    zone: deckCard.zone,
    quantity: deckCard.quantity,
    preferredPrintingId: deckCard.preferredPrintingId,
    cardName: card.name,
    cardType: card.type,
    superTypes: card.superTypes,
    domains: card.domains,
    tags: card.tags ?? EMPTY_ARRAY,
    keywords: card.keywords ?? EMPTY_ARRAY,
    energy: card.energy,
    might: card.might,
    power: card.power,
  };
}
