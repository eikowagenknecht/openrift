import type { DeckZone } from "@openrift/shared";

/** One deck-card row produced by an import: the shape both the server
 * save-cards mutation and the local-decks store accept. */
export interface ImportedDeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

/** The slice of a matched import entry the dedupe needs. */
interface MatchedEntryLike {
  zone: DeckZone;
  entry: { quantity: number };
  resolvedCard: { cardId: string; preferredPrintingId: string | null } | null;
}

/**
 * Group matched import entries by cardId + zone + preferredPrintingId,
 * summing quantities. Printing-specific matches (piltover/tts short codes)
 * become distinct rows from any default-art rows of the same card. Entries
 * without a resolved card are skipped.
 * @returns The deduped deck-card rows.
 */
export function dedupeMatchedEntries(entries: readonly MatchedEntryLike[]): ImportedDeckCard[] {
  const cardMap = new Map<string, ImportedDeckCard>();
  for (const entry of entries) {
    if (!entry.resolvedCard) {
      continue;
    }
    const preferredPrintingId = entry.resolvedCard.preferredPrintingId;
    const key = `${entry.resolvedCard.cardId}::${entry.zone}::${preferredPrintingId ?? ""}`;
    const existing = cardMap.get(key);
    if (existing) {
      existing.quantity += entry.entry.quantity;
    } else {
      cardMap.set(key, {
        cardId: entry.resolvedCard.cardId,
        zone: entry.zone,
        quantity: entry.entry.quantity,
        preferredPrintingId,
      });
    }
  }
  return [...cardMap.values()];
}
