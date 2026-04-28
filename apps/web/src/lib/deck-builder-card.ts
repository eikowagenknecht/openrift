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

const COPY_LIMIT_ZONES: ReadonlySet<DeckZone> = new Set([
  WellKnown.deckZone.MAIN,
  WellKnown.deckZone.SIDEBOARD,
  WellKnown.deckZone.OVERFLOW,
  WellKnown.deckZone.CHAMPION,
]);

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

/**
 * Determines whether dropping the currently dragged card into `zone` would
 * exceed a zone's capacity (3-copy cap, 12-rune cap, battlefield uniqueness).
 *
 * Cross-zone moves of an existing deck card preserve the cross-zone copy
 * total, so the 3-copy cap doesn't apply — including for drops back into the
 * source zone, which would otherwise force the user to discard the card.
 *
 * @returns true if the zone should reject the drop.
 */
export function isDeckZoneFullForDrag(args: {
  zone: DeckZone;
  draggedCardId: string;
  /** Source zone of the dragged card, or null when the drag started in the card browser. */
  fromZone: DeckZone | null;
  allCards: readonly { cardId: string; zone: DeckZone; quantity: number }[];
}): boolean {
  const { zone, draggedCardId, fromZone, allCards } = args;
  if (COPY_LIMIT_ZONES.has(zone) && fromZone === null) {
    const total = allCards
      .filter((entry) => entry.cardId === draggedCardId && COPY_LIMIT_ZONES.has(entry.zone))
      .reduce((sum, entry) => sum + entry.quantity, 0);
    if (total >= 3) {
      return true;
    }
  }
  if (zone === WellKnown.deckZone.BATTLEFIELD) {
    return allCards.some(
      (card) => card.cardId === draggedCardId && card.zone === WellKnown.deckZone.BATTLEFIELD,
    );
  }
  if (zone === WellKnown.deckZone.RUNES) {
    const runeTotal = allCards
      .filter((card) => card.zone === WellKnown.deckZone.RUNES)
      .reduce((sum, card) => sum + card.quantity, 0);
    return runeTotal >= 12;
  }
  return false;
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
