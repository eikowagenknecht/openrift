import type { DeckCardResponse, ListEntryDetailResponse, Printing } from "@openrift/shared";

/**
 * Picks the printing that should stand for `cardId` on the stage: the pinned
 * one when the source names it and the catalog still has it, else the card's
 * first printing in the viewer's language order.
 *
 * @returns The printing id, or null when the catalog knows neither.
 */
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

/**
 * A deck's cards as a presentation queue, in the order the deck returns them.
 *
 * Quantity is ignored: a playset of three is one stop on the walk, not three.
 * A card the catalog no longer knows is skipped rather than leaving a hole.
 *
 * @returns The deck's printing ids.
 */
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

/**
 * A list's entries as a presentation queue.
 *
 * Printing- and copy-level entries already name their printing; card-level
 * entries fall back to the card's first printing. Duplicates collapse — a
 * tradelist with four copies of a card is still one stop.
 *
 * @returns The list's printing ids, in entry order.
 */
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
