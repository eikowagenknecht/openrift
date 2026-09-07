import type { DeckZone } from "@openrift/shared/types/enums";

/** The shape both the server save-cards mutation and the local-decks store accept. */
export interface ImportedDeckCard {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

interface MatchedEntryLike {
  zone: DeckZone;
  entry: { quantity: number };
  resolvedCard: { cardId: string; preferredPrintingId: string | null } | null;
}

/** Groups by cardId + zone + preferredPrintingId, so a printing-specific match (short code) stays a distinct row from a default-art match of the same card. */
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
