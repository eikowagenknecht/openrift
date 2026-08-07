import type { DeckZone } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

/**
 * Riftbound opening hand size. The mulligan lets you exchange up to
 * {@link MULLIGAN_LIMIT} of these once.
 */
export const OPENING_HAND_SIZE = 4;
export const MULLIGAN_LIMIT = 2;

/**
 * How many cards the odds table's second column looks at. Deliberately
 * phrased as a card count ("first N cards"), not a turn number, so we don't
 * encode turn-structure assumptions here.
 */
export const EARLY_DRAWS = 7;

/**
 * n choose r as a float. Multiplicative form keeps intermediate values small
 * enough for deck-sized inputs (n ≤ ~60), where exact integers don't matter —
 * the result feeds a probability.
 * @returns The binomial coefficient, or 0 when r is out of range.
 */
export function choose(n: number, r: number): number {
  if (r < 0 || r > n) {
    return 0;
  }
  const k = Math.min(r, n - r);
  let result = 1;
  for (let index = 0; index < k; index++) {
    result = (result * (n - index)) / (index + 1);
  }
  return result;
}

/**
 * Chance of seeing at least one of `copies` target cards among `draws` cards
 * drawn from a `deckSize` deck (hypergeometric).
 * @returns A probability in [0, 1].
 */
export function chanceToDraw(copies: number, deckSize: number, draws: number): number {
  if (copies <= 0 || deckSize <= 0) {
    return 0;
  }
  if (draws >= deckSize || copies >= deckSize) {
    return 1;
  }
  const cappedDraws = Math.min(draws, deckSize);
  const none = choose(deckSize - copies, cappedDraws) / choose(deckSize, cappedDraws);
  return 1 - none;
}

/**
 * Formats a draw probability for display. Only a true certainty shows 100%
 * (or 0%): a 99.9% chance renders as ">99%", not as a guarantee the deck can
 * still miss, and the mirror case renders as "<1%".
 * @returns The percentage string.
 */
export function formatChancePct(value: number): string {
  if (value < 1 && value > 0.995) {
    return ">99%";
  }
  if (value > 0 && value < 0.005) {
    return "<1%";
  }
  return `${Math.round(value * 100)}%`;
}

export interface DrawOddsRow {
  cardId: string;
  cardName: string;
  copies: number;
  /** Chance of at least one copy in the opening hand. */
  openingChance: number;
  /** Chance of at least one copy among the first {@link EARLY_DRAWS} cards. */
  earlyChance: number;
}

/**
 * Draw-odds rows for a deck's main zone: one row per distinct card, sorted by
 * copy count (desc) then name, computed against the main deck's total size.
 * @returns The rows; empty when the main deck is empty.
 */
export function buildDrawOddsRows(
  cards: readonly { cardId: string; cardName: string; quantity: number; zone: DeckZone }[],
): DrawOddsRow[] {
  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const deckSize = mainCards.reduce((sum, card) => sum + card.quantity, 0);
  if (deckSize === 0) {
    return [];
  }
  return mainCards
    .map((card) => ({
      cardId: card.cardId,
      cardName: card.cardName,
      copies: card.quantity,
      openingChance: chanceToDraw(card.quantity, deckSize, OPENING_HAND_SIZE),
      earlyChance: chanceToDraw(card.quantity, deckSize, EARLY_DRAWS),
    }))
    .toSorted(
      (left, right) => right.copies - left.copies || left.cardName.localeCompare(right.cardName),
    );
}
