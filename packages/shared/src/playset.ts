import type { CardType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

/** Number of copies that constitute a complete playset for a card. */
export type PlaysetSize = 1 | 3;

/**
 * Returns the deck-relevant max copies for a card.
 *
 * - Legends: 1 (legend zone holds exactly one)
 * - Battlefields: 1 (battlefield zone holds three unique cards)
 * - Cards with the [Unique] keyword: 1
 * - Everything else: 3 (main deck copy limit)
 *
 * `keywords` should be the canonical English keyword names from `Card.keywords`,
 * which is pre-computed server-side from EN printings + errata.
 *
 * @returns 1 for unique-style cards, 3 otherwise.
 */
export function getPlaysetSize(cardType: CardType, keywords: readonly string[]): PlaysetSize {
  if (cardType === WellKnown.cardType.LEGEND || cardType === WellKnown.cardType.BATTLEFIELD) {
    return 1;
  }
  if (keywords.includes(WellKnown.keyword.UNIQUE)) {
    return 1;
  }
  return 3;
}
