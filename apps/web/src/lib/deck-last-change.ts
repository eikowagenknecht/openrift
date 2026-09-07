import { legendDisplayName } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface DeckLastChange {
  cardName: string;
  delta: number;
}

interface CardTotal {
  cardName: string;
  quantity: number;
}

/** Ignores zones: a card moved from sideboard to main hasn't changed in count. */
function totalsByCard(cards: readonly DeckBuilderCard[]): Map<string, CardTotal> {
  const totals = new Map<string, CardTotal>();
  for (const card of cards) {
    const existing = totals.get(card.cardId);
    if (existing) {
      existing.quantity += card.quantity;
    } else {
      totals.set(card.cardId, {
        cardName: legendDisplayName({
          name: card.cardName,
          types: card.cardTypes,
          tags: card.tags,
        }),
        quantity: card.quantity,
      });
    }
  }
  return totals;
}

/** When several cards changed at once, names the biggest swing; ties break by card name for a stable result. */
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
