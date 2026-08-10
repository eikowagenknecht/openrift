import type { ListKind } from "@openrift/shared";

import type { InitialEntry } from "@/components/list/create-list-dialog";
import type { CardOwnership } from "@/hooks/use-deck-ownership";
import type { CardmarketWant } from "@/lib/list-export";

/**
 * Maps a deck's missing-card rows to Cardmarket wants: one want per row with
 * the shortfall as quantity. Rows without a shortfall are dropped (defensive —
 * the missing list should only carry rows with one). The same card appearing
 * in several zones yields several wants; `formatCardmarketWants` merges them
 * into one line by name.
 * @returns The wants ready for `formatCardmarketWants`.
 */
export function missingCardsToWants(cards: readonly CardOwnership[]): CardmarketWant[] {
  return cards
    .filter((card) => card.shortfall > 0)
    .map((card) => ({ name: card.cardName, quantity: card.shortfall }));
}

/**
 * Maps a deck's missing-card rows to list entries for a wishlist of the given
 * kind: card-kind lists get one entry per row keyed by card, printing-kind
 * lists one entry keyed by the row's completion printing (the cheapest
 * printing that fills the shortfall, falling back to the display printing
 * when nothing cheaper is priced). Rows without either printing are skipped
 * for printing-kind lists (a card with no catalog printings has nothing to
 * pin), and copy-kind lists get no entries — missing cards aren't owned
 * copies. Duplicate targets across zones are summed server-side on bulk add.
 * @returns The entries to bulk-add to the list.
 */
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
