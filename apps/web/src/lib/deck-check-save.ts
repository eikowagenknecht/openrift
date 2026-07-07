import type { DeckCheckEntryCardResponse } from "@openrift/shared";

import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";

/**
 * Convert a deck-check entry's resolved card lines into the deck-card rows the
 * save-cards mutation accepts. Only catalog-matched lines carry over; ambiguous
 * and unmatched lines are counted so the caller can tell the user what was
 * skipped. Duplicate lines for the same card, zone, and printing merge into one
 * row with summed quantities.
 * @returns The deck-card rows plus how many lines could not be carried over.
 */
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
