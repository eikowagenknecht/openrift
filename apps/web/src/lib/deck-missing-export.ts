import type { ListKind } from "@openrift/shared";

import type { CardOwnership } from "@/lib/deck-ownership-types";
import type { CardmarketWant } from "@/lib/list-export";
import type { InitialEntry } from "@/lib/list-initial-entry";

export function missingCardsToWants(cards: readonly CardOwnership[]): CardmarketWant[] {
  return cards
    .filter((card) => card.shortfall > 0)
    .map((card) => ({ name: card.displayName, quantity: card.shortfall }));
}

export function missingCardsToListEntries(
  cards: readonly CardOwnership[],
  kind: ListKind,
): InitialEntry[] {
  const missing = cards.filter((card) => card.shortfall > 0);
  if (kind === "card") {
    return missing.map((card) => ({ cardId: card.cardId, quantity: card.shortfall }));
  }
  if (kind === "printing") {
    return missing.flatMap((card) => {
      const printing = card.cheapestPrinting ?? card.displayPrinting;
      return printing ? [{ printingId: printing.id, quantity: card.shortfall }] : [];
    });
  }
  return [];
}
