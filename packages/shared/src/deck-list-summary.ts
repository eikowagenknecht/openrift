import type { DeckCard } from "./deck-rules.js";
import { validateDeck } from "./deck-rules.js";
import type { CardType, DeckFormat, Domain } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

/**
 * The per-card fields a deck summary reads. Deliberately structural: the API
 * passes DB rows and the web app passes builder cards, and neither should have
 * to reshape a deck just to count it.
 */
export interface DeckCardSummaryInput {
  cardId: string;
  zone: string;
  quantity: number;
  cardTypes: readonly string[];
  domains: readonly string[];
}

/** Enum display order, which the counts are emitted in. */
export interface DeckSummaryOrders {
  cardTypes: readonly string[];
  domains: readonly string[];
}

export interface DeckCardStats {
  legendCardId: string | null;
  championCardId: string | null;
  totalCards: number;
  typeCounts: { cardType: CardType; count: number }[];
  domainDistribution: { domain: Domain; count: number }[];
}

// Type and domain stats describe the playable body of the deck, so they come
// from the main and champion zones only, and the three singleton types are left
// out of the unit/spell/gear breakdown.
const EXCLUDED_TYPES = new Set<string>([
  WellKnown.cardType.LEGEND,
  WellKnown.cardType.RUNE,
  WellKnown.cardType.BATTLEFIELD,
]);
const COUNTED_ZONES = new Set<string>([WellKnown.deckZone.MAIN, WellKnown.deckZone.CHAMPION]);

/**
 * The derived numbers a deck list tile shows. Server decks and browser-local
 * decks (ADR-035) flow through the same tile, so both derive them here rather
 * than each mirroring the other.
 *
 * @returns The deck's legend, champion, card total and type/domain breakdowns.
 */
export function summarizeDeckCards(
  cards: readonly DeckCardSummaryInput[],
  orders: DeckSummaryOrders,
): DeckCardStats {
  const typeCountMap = new Map<string, number>();
  const domainCountMap = new Map<string, number>();
  let totalCards = 0;
  let legendCardId: string | null = null;
  let championCardId: string | null = null;

  for (const card of cards) {
    if (legendCardId === null && card.zone === WellKnown.deckZone.LEGEND) {
      legendCardId = card.cardId;
    }
    if (championCardId === null && card.zone === WellKnown.deckZone.CHAMPION) {
      championCardId = card.cardId;
    }
    // Overflow is a parking zone, so its copies are not part of the deck.
    if (card.zone !== WellKnown.deckZone.OVERFLOW) {
      totalCards += card.quantity;
    }
    if (!COUNTED_ZONES.has(card.zone)) {
      continue;
    }
    // Fan out over the full type set (ADR-037): a multi-type card counts under
    // each of its non-excluded types.
    for (const cardType of card.cardTypes) {
      if (!EXCLUDED_TYPES.has(cardType)) {
        typeCountMap.set(cardType, (typeCountMap.get(cardType) ?? 0) + card.quantity);
      }
    }
    for (const domain of card.domains) {
      domainCountMap.set(domain, (domainCountMap.get(domain) ?? 0) + card.quantity);
    }
  }

  return {
    legendCardId,
    championCardId,
    totalCards,
    typeCounts: orders.cardTypes
      .filter((type) => typeCountMap.has(type))
      .map((type) => ({ cardType: type as CardType, count: typeCountMap.get(type) ?? 0 })),
    domainDistribution: orders.domains
      .filter((domain) => domainCountMap.has(domain))
      .map((domain) => ({ domain: domain as Domain, count: domainCountMap.get(domain) ?? 0 })),
  };
}

/**
 * The pass/fail a deck list tile reports. Only Constructed is judged: the list
 * query does not load per-card custom tag assignments, and the tag-membership
 * rule would mis-report without them. Other formats therefore read as valid in
 * the list and surface their real violations on the deck page.
 *
 * @returns Whether the deck should show as valid in a list.
 */
export function isValidInDeckList(format: string, cards: readonly DeckCard[]): boolean {
  if (format !== WellKnown.deckFormat.CONSTRUCTED) {
    return true;
  }
  return (
    validateDeck({
      format: WellKnown.deckFormat.CONSTRUCTED as DeckFormat,
      cards: [...cards],
    }).length === 0
  );
}
