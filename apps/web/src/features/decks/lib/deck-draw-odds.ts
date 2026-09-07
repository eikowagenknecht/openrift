import type { DeckZone } from "@openrift/shared/types/enums";
import { WellKnown } from "@openrift/shared/well-known";

/** Riftbound opening hand size; the mulligan swaps up to {@link MULLIGAN_LIMIT} of these once. */
export const OPENING_HAND_SIZE = 4;
export const MULLIGAN_LIMIT = 2;

export const EARLY_DRAWS = 7;

/** n choose r; the multiplicative form keeps intermediate values small for deck-sized n (≤ ~60). */
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

/** Hypergeometric chance of at least one of `copies` target cards among `draws` drawn from `deckSize`. */
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

/** Only a true certainty renders as 100%/0%; a 99.9% chance shows ">99%", not a guarantee. */
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
  openingChance: number;
  earlyChance: number;
}

/** One row per distinct card in the main zone, sorted by copy count desc then name. */
export function buildDrawOddsRows(
  cards: readonly { cardId: string; cardName: string; quantity: number; zone: DeckZone }[],
): DrawOddsRow[] {
  const mainCards = cards.filter((card) => card.zone === WellKnown.deckZone.MAIN);
  const deckSize = mainCards.reduce((sum, card) => sum + card.quantity, 0);
  if (deckSize === 0) {
    return [];
  }
  const byCard = new Map<string, { cardName: string; copies: number }>();
  for (const card of mainCards) {
    const entry = byCard.get(card.cardId);
    if (entry) {
      entry.copies += card.quantity;
    } else {
      byCard.set(card.cardId, { cardName: card.cardName, copies: card.quantity });
    }
  }
  return [...byCard.entries()]
    .map(([cardId, { cardName, copies }]) => ({
      cardId,
      cardName,
      copies,
      openingChance: chanceToDraw(copies, deckSize, OPENING_HAND_SIZE),
      earlyChance: chanceToDraw(copies, deckSize, EARLY_DRAWS),
    }))
    .toSorted(
      (left, right) => right.copies - left.copies || left.cardName.localeCompare(right.cardName),
    );
}
