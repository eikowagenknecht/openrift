import type { Card, Printing } from "@openrift/shared/types/catalog";
import { compareCardDisplayName, preferredPrinting } from "@openrift/shared/utils";

import { useCards } from "@/hooks/use-cards";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

export interface DeckTokenEntry {
  card: Card;
  printing: Printing;
  sourceNames: string[];
}

/** Filters to printings with art before the language preference, so a translated printing with no image can't win over an illustrated one. */
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
 * Suspends because `useCards()` does. Mount behind a `Suspense` boundary,
 * never at the top of an SSR-rendered tree.
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
    if (card && printing) {
      entries.push({ card, printing, sourceNames });
    }
  }

  return entries.toSorted((a, b) => compareCardDisplayName(a.card, b.card));
}
