import type { SearchableCard, SearchablePrintingCodes } from "@openrift/shared/card-search";
import {
  buildCardIndex,
  CARD_SEARCH_MIN_QUERY_LENGTH,
  CARD_SEARCH_RESULT_LIMIT,
  searchCards,
} from "@openrift/shared/card-search";
import { useMemo } from "react";

import type { CardSearchResult } from "@/lib/card-search-result";

const NO_PRINTING_CODES: ReadonlyMap<string, readonly SearchablePrintingCodes[]> = new Map();

/**
 * Ranked free-text card search shared by every card picker in the app.
 * `cards` and `printingsByCardId` must be identity-stable across keystrokes; both
 * `useMemo` calls are deliberate, rebuilding the search index per keystroke otherwise.
 */
export function useCardSearch<TCard extends SearchableCard>(
  cards: readonly TCard[],
  query: string,
  printingsByCardId: ReadonlyMap<string, readonly SearchablePrintingCodes[]> = NO_PRINTING_CODES,
  limit: number = CARD_SEARCH_RESULT_LIMIT,
  minQueryLength: number = CARD_SEARCH_MIN_QUERY_LENGTH,
): TCard[] {
  const index = useMemo(() => buildCardIndex(cards, printingsByCardId), [cards, printingsByCardId]);

  return useMemo(() => {
    if (query.length < minQueryLength) {
      return [];
    }
    return searchCards(index, query, limit);
  }, [index, query, limit, minQueryLength]);
}

export interface AdminSearchableCard extends SearchableCard {
  types: string[];
  shortCodes: string[];
}

export function useAdminCardSearch(
  cards: readonly AdminSearchableCard[],
  query: string,
): CardSearchResult[] {
  const printingsByCardId = useMemo(
    () =>
      new Map(
        cards.map((card) => [
          card.id,
          // No public codes here, so each short code stands in for both.
          card.shortCodes.map((code) => ({ shortCode: code, publicCode: code })),
        ]),
      ),
    [cards],
  );

  const matches = useCardSearch(cards, query, printingsByCardId);
  return matches.map((card) => ({
    id: card.id,
    label: card.name,
    sublabel: card.slug,
    detail: card.types.join(" "),
  }));
}

interface AssignableCard {
  cardId: string;
  cardSlug: string;
  cardName: string;
  setName: string;
  shortCodes: string[];
}

const ASSIGNABLE_RESULT_LIMIT = 10;

export function useAssignableCardSearch(
  cards: readonly AssignableCard[],
  query: string,
): CardSearchResult[] {
  const searchable = useMemo(
    () =>
      cards.map((card) => ({
        id: card.cardId,
        slug: card.cardSlug,
        name: card.cardName,
        setName: card.setName,
        firstShortCode: card.shortCodes.toSorted((a, b) => a.localeCompare(b))[0] ?? "",
      })),
    [cards],
  );

  const printingsByCardId = useMemo(
    () =>
      new Map(
        cards.map((card) => [
          card.cardId,
          // No public codes here, so each short code stands in for both.
          card.shortCodes.map((code) => ({ shortCode: code, publicCode: code })),
        ]),
      ),
    [cards],
  );

  const matches = useCardSearch(searchable, query, printingsByCardId, ASSIGNABLE_RESULT_LIMIT);

  return matches.map((card) => ({
    id: card.id,
    label: card.name,
    sublabel: card.firstShortCode,
    detail: card.setName,
  }));
}
