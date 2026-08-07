import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface DeckLastChange {
  cardName: string;
  /** Copies gained (positive) or lost (negative) across the whole deck. */
  delta: number;
}

interface CardTotal {
  cardName: string;
  quantity: number;
}

/**
 * Collapses a deck to one total per card, ignoring zones — a card moved from
 * the sideboard to the main deck hasn't changed in count, and the dock should
 * not announce it as an edit.
 * @returns cardId → name and total quantity.
 */
function totalsByCard(cards: readonly DeckBuilderCard[]): Map<string, CardTotal> {
  const totals = new Map<string, CardTotal>();
  for (const card of cards) {
    const existing = totals.get(card.cardId);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      totals.set(card.cardId, { cardName: card.cardName, quantity: card.quantity });
    }
  }
  return totals;
}

/**
 * The headline difference between two deck states, for the "+2 Honest Broker"
 * readout. One edit usually touches one card; when several moved at once (a
 * legend switch drops one and adds another, autofill rebalances runes) the
 * biggest swing is the one worth naming, with the card name breaking ties so
 * the result is stable.
 *
 * @returns The card and its signed delta, or null when the two states hold the
 * same copies of everything.
 */
export function lastChange(
  previous: readonly DeckBuilderCard[],
  current: readonly DeckBuilderCard[],
): DeckLastChange | null {
  const before = totalsByCard(previous);
  const after = totalsByCard(current);

  let best: DeckLastChange | null = null;
  for (const cardId of new Set([...before.keys(), ...after.keys()])) {
    const wasCount = before.get(cardId)?.quantity ?? 0;
    const nowCount = after.get(cardId)?.quantity ?? 0;
    const delta = nowCount - wasCount;
    if (delta === 0) {
      continue;
    }
    // A removed card is gone from `current`, so its name only survives in the
    // previous snapshot.
    const cardName = after.get(cardId)?.cardName ?? before.get(cardId)?.cardName ?? "";
    const bigger = best === null || Math.abs(delta) > Math.abs(best.delta);
    const tied = best !== null && Math.abs(delta) === Math.abs(best.delta);
    if (bigger || (tied && cardName.localeCompare(best?.cardName ?? "") < 0)) {
      best = { cardName, delta };
    }
  }
  return best;
}
