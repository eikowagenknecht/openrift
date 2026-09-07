import type { DeckCardResponse, ListEntryDetailResponse, Printing } from "@openrift/shared";

function preferredPrintingId(
  cardId: string,
  pinnedId: string | null,
  printingsByCardId: Map<string, Printing[]>,
  printingsById: Record<string, Printing>,
): string | null {
  if (pinnedId !== null && printingsById[pinnedId]) {
    return pinnedId;
  }
  return printingsByCardId.get(cardId)?.[0]?.id ?? null;
}

/** Quantity is ignored: a playset of three is one stop on the walk, not three. */
export function deckPrintingIds(
  cards: readonly DeckCardResponse[],
  printingsByCardId: Map<string, Printing[]>,
  printingsById: Record<string, Printing>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const id = preferredPrintingId(
      card.cardId,
      card.preferredPrintingId,
      printingsByCardId,
      printingsById,
    );
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function listPrintingIds(
  entries: readonly ListEntryDetailResponse[],
  printingsByCardId: Map<string, Printing[]>,
  printingsById: Record<string, Printing>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id =
      entry.kind === "card"
        ? preferredPrintingId(entry.cardId, null, printingsByCardId, printingsById)
        : (printingsById[entry.printingId]?.id ?? null);
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
