import type { Card, Printing } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/** One token a deck calls for, with the printing to show and who asks for it. */
export interface DeckTokenEntry {
  card: Card;
  printing: Printing;
  /** Names of the deck's cards that create this token, in deck order, deduped. */
  sourceNames: string[];
}

/**
 * The tokens a deck needs at the table, derived from its cards' `tokenCardIds`.
 *
 * The relation itself is computed server-side from EN rules text and stored as
 * card ids (migration 226), so nothing here parses text. That is what makes the
 * section language-neutral: the ids are the same everywhere, and the printing
 * shown for each one follows the viewer's language through
 * `usePreferredPrinting`.
 *
 * Suspends, because `useCards()` does. Mount it behind the overview's hydration
 * gate and a `Suspense` boundary, never at the top of an SSR-rendered tree.
 *
 * @returns One entry per distinct token, ordered by token name.
 */
export function useDeckTokens(cards: DeckBuilderCard[]): DeckTokenEntry[] {
  "use memo";

  const { cardsById } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();

  const sourceNamesByToken = new Map<string, string[]>();
  for (const entry of cards) {
    const tokenCardIds = cardsById[entry.cardId]?.tokenCardIds;
    if (!tokenCardIds) {
      continue;
    }
    for (const tokenCardId of tokenCardIds) {
      // A card in two zones (main and sideboard) must not be listed twice.
      const names = sourceNamesByToken.get(tokenCardId) ?? [];
      if (!names.includes(entry.cardName)) {
        names.push(entry.cardName);
      }
      sourceNamesByToken.set(tokenCardId, names);
    }
  }

  const entries: DeckTokenEntry[] = [];
  for (const [tokenCardId, sourceNames] of sourceNamesByToken) {
    const card = cardsById[tokenCardId];
    const printing = getPreferredPrinting(tokenCardId);
    // A token with no printing in the catalog has nothing to render. Dropping
    // it beats an empty frame, and it can only happen mid-import.
    if (card && printing) {
      entries.push({ card, printing, sourceNames });
    }
  }

  return entries.toSorted((a, b) => a.card.name.localeCompare(b.card.name));
}
