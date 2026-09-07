import type { Card } from "@openrift/shared";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared";
import { useMemo } from "react";

import type { CardSearchResult } from "@/components/cards/card-search-dropdown";
import { CardThumbnail } from "@/components/cards/printing-option-content";
import { useCardSearch } from "@/hooks/use-card-search";
import { useCards } from "@/hooks/use-cards";

/**
 * Free-text catalog lookup for card pickers, adding thumbnails and
 * printing-code lookups on top of {@link useCardSearch}. `filter` must be
 * identity-stable (a module-level predicate) or the search index rebuilds
 * every render.
 */
export function useCatalogCardSearch(
  query: string,
  filter?: (card: Card) => boolean,
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
    leading: <CardThumbnail cardId={card.id} className="h-8" />,
  }));
}
