import type { Card } from "@openrift/shared/types/catalog";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared/utils";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { useCardSearch } from "@/features/cards/hooks/use-card-search";
import { useCards } from "@/features/cards/hooks/use-cards";
import type { CardSearchResult } from "@/features/cards/lib/card-search-result";

/**
 * `filter` must be identity-stable (a module-level predicate) or the search
 * index rebuilds every render.
 */
export function useCatalogCardSearch(
  query: string,
  filter?: (card: Card) => boolean,
  renderLeading?: (cardId: string) => ReactNode,
): CardSearchResult[] {
  const { cardsById, printingsByCardId } = useCards();

  const cards = useMemo(
    () =>
      Object.entries(cardsById)
        .filter(([, card]) => filter === undefined || filter(card))
        .map(([id, card]) => ({
          id,
          slug: card.slug,
          name: card.name,
          // The row shows the name players use ("Azir, Emperor of the Sands"),
          // not the stored catalog name.
          displayName: legendDisplayName(card),
          altNames: cardSearchAltNames(card),
        })),
    [cardsById, filter],
  );

  const matches = useCardSearch(cards, query, printingsByCardId);

  return matches.map((card) => ({
    id: card.id,
    label: card.displayName,
    sublabel: card.slug,
    leading: renderLeading?.(card.id),
  }));
}
