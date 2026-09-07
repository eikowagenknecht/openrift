import type { DeckCheckEntryCardResponse } from "@openrift/shared/types/api/deck-check";

import type { ImportedDeckCard } from "@/features/decks/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/features/decks/lib/deck-import-cards";

/** Only catalog-matched lines carry over; ambiguous and unmatched lines are counted as skipped. */
export function deckCardsFromCheckEntry(cards: readonly DeckCheckEntryCardResponse[]): {
  cards: ImportedDeckCard[];
  skippedCount: number;
} {
  const skippedCount = cards.filter(
    (card) => card.matchStatus !== "matched" || card.resolvedCardId === null,
  ).length;
  const deckCards = dedupeMatchedEntries(
    cards.map((card) => ({
      zone: card.zone,
      entry: { quantity: card.quantity },
      resolvedCard:
        card.matchStatus === "matched" && card.resolvedCardId !== null
          ? { cardId: card.resolvedCardId, preferredPrintingId: card.resolvedPrintingId }
          : null,
    })),
  );
  return { cards: deckCards, skippedCount };
}
