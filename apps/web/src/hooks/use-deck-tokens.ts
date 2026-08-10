import type { Card, Printing } from "@openrift/shared";
import { preferredPrinting } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/** One token a deck calls for, with the printing to show and who asks for it. */
export interface DeckTokenEntry {
  card: Card;
  printing: Printing;
  /** Names of the deck's cards that create this token, in deck order, deduped. */
  sourceNames: string[];
}

/**
 * The printing to show for a token, preferring one that has art.
 *
 * Nothing pins a token's printing — a token is never a deck entry — so the pick
 * is purely presentational and the plain language preference is the wrong tool
 * on its own: several tokens have a translated printing on file whose image
 * hasn't landed yet, and that printing wins the language comparison over an
 * illustrated one, leaving a blank where every other card shows art. So run the
 * preference over the printings that can actually be shown, and fall back to
 * the full set only when none of them has a front image.
 *
 * @returns The printing to render, or undefined when the card has none.
 */
function tokenPrinting(
  candidates: Printing[] | undefined,
  languageOrder: readonly string[],
): Printing | undefined {
  if (!candidates) {
    return undefined;
  }
  const withArt = candidates.filter((printing) =>
    printing.images.some((image) => image.face === "front"),
  );
  return preferredPrinting(withArt, languageOrder) ?? preferredPrinting(candidates, languageOrder);
}

/**
 * The tokens a deck needs at the table, derived from its cards' `tokenCardIds`.
 *
 * The relation itself is computed server-side from EN rules text and stored as
 * card ids (migration 226), so nothing here parses text. That is what makes the
 * section language-neutral: the ids are the same everywhere, and the printing
 * shown for each one follows the viewer's language, art permitting (see
 * {@link tokenPrinting}).
 *
 * Suspends, because `useCards()` does. Mount it behind the overview's hydration
 * gate and a `Suspense` boundary, never at the top of an SSR-rendered tree.
 *
 * @returns One entry per distinct token, ordered by token name.
 */
export function useDeckTokens(cards: DeckBuilderCard[]): DeckTokenEntry[] {
  "use memo";

  const { cardsById, printingsByCardId } = useCards();
  const languageOrder = useEffectiveLanguageOrder();

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
    const printing = tokenPrinting(printingsByCardId.get(tokenCardId), languageOrder);
    // A token with no printing in the catalog has nothing to render. Dropping
    // it beats an empty frame, and it can only happen mid-import.
    if (card && printing) {
      entries.push({ card, printing, sourceNames });
    }
  }

  return entries.toSorted((a, b) => a.card.name.localeCompare(b.card.name));
}
