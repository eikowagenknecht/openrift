import { buildCardIndex, searchCards } from "@openrift/shared";
import { useMemo } from "react";

import type { CardSearchResult } from "@/components/cards/card-search-dropdown";
import { useCards } from "@/hooks/use-cards";

/** Shortest query the picker searches on; one letter matches most of the catalog. */
const MIN_QUERY_LENGTH = 2;

/** How many hits a picker dropdown shows. */
const RESULT_LIMIT = 20;

/**
 * Free-text catalog lookup for the admin card pickers, backed by the shared
 * ranked matcher (`@openrift/shared/card-search`) rather than a local substring
 * scan. That buys the same folding the site's search uses — apostrophes and
 * typographic punctuation never decide a match — plus printing-code lookups, so
 * an admin holding a physical card can type `OGN-202` instead of its name.
 *
 * The index is built once per catalog and reused across keystrokes: `useCards`
 * returns identity-stable data, so the memo only recomputes when the catalog
 * itself changes.
 *
 * @param query What the user typed; anything shorter than two characters
 *   returns nothing rather than most of the catalog.
 * @returns Ranked results in the {@link CardSearchResult} shape the shared
 *   dropdown renders.
 */
export function useCatalogCardSearch(query: string): CardSearchResult[] {
  const { cardsById, printingsByCardId } = useCards();

  const index = useMemo(
    () =>
      buildCardIndex(
        Object.entries(cardsById).map(([id, card]) => ({
          id,
          slug: card.slug,
          name: card.name,
        })),
        printingsByCardId,
      ),
    [cardsById, printingsByCardId],
  );

  return useMemo(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      return [];
    }
    return searchCards(index, query, RESULT_LIMIT).map((card) => ({
      id: card.id,
      label: card.name,
      sublabel: card.slug,
    }));
  }, [index, query]);
}
