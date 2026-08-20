import { useMemo } from "react";

import type { CardSearchResult } from "@/components/cards/card-search-dropdown";
import { CardThumbnail } from "@/components/cards/printing-option-content";
import { useCardSearch } from "@/hooks/use-card-search";
import { useCards } from "@/hooks/use-cards";

/**
 * Free-text catalog lookup for the card pickers, on top of the shared
 * {@link useCardSearch} matcher. Adds the two things a catalog-backed picker
 * can supply for free that a lean admin list cannot: the card's representative
 * art, and printing-code lookups.
 *
 * The searchable list is memoized because {@link useCardSearch} keys its index
 * on the array's identity; `useCards` returns identity-stable data, so this
 * recomputes only when the catalog itself changes.
 *
 * @param query What the user typed; short queries return nothing.
 * @returns Ranked results in the {@link CardSearchResult} shape the shared
 *   dropdown renders, each with a thumbnail.
 */
export function useCatalogCardSearch(query: string): CardSearchResult[] {
  const { cardsById, printingsByCardId } = useCards();

  const cards = useMemo(
    () =>
      Object.entries(cardsById).map(([id, card]) => ({
        id,
        slug: card.slug,
        name: card.name,
      })),
    [cardsById],
  );

  const matches = useCardSearch(cards, query, printingsByCardId);

  return matches.map((card) => ({
    id: card.id,
    label: card.name,
    sublabel: card.slug,
    leading: <CardThumbnail cardId={card.id} className="h-8" />,
  }));
}
