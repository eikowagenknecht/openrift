import type { SearchableCard, SearchablePrintingCodes } from "@openrift/shared";
import { buildCardIndex, searchCards } from "@openrift/shared";
import { useMemo } from "react";

import type { CardSearchResult } from "@/components/cards/card-search-dropdown";

/** Shortest query a picker searches on; one letter matches most of any catalog. */
const CARD_SEARCH_MIN_QUERY_LENGTH = 2;

/** How many hits a picker dropdown shows. */
const CARD_SEARCH_RESULT_LIMIT = 20;

/** Shared empty map so a caller with no printing codes keeps a stable index dep. */
const NO_PRINTING_CODES: ReadonlyMap<string, readonly SearchablePrintingCodes[]> = new Map();

/**
 * Ranked free-text card lookup over any card list, backed by the shared matcher
 * (`@openrift/shared/card-search`) rather than a local substring scan. Every
 * card picker in the app goes through this, so they all get the same folding
 * (apostrophes and typographic punctuation never decide a match) and the same
 * printing-code lookups, letting someone holding a physical card type `OGN-202`
 * instead of a name.
 *
 * `cards` and `printingsByCardId` must be identity-stable across keystrokes
 * (a query result, or a value memoized by the caller); the index is rebuilt
 * whenever either identity changes.
 *
 * Note on `useMemo`: the repo's React Compiler convention says not to reach for
 * it, but the index folds every name in the list, and re-running that per
 * keystroke is the exact cost this hook exists to avoid. Both memos are
 * deliberate and predate the convention.
 *
 * @param cards The candidate set to search; may be the whole catalog or one
 *   surface's narrower list.
 * @param query What the user typed; anything shorter than
 *   {@link CARD_SEARCH_MIN_QUERY_LENGTH} returns nothing rather than most of the list.
 * @param printingsByCardId Lookup codes per card, when the caller has them.
 *   Omit to search names only.
 * @param limit How many hits to return.
 * @param minQueryLength Lower this for a picker searching a small fixed set
 *   (a deck zone), where one letter is a useful filter rather than a flood.
 * @returns Ranked matches, best first, in the caller's own card shape.
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

/** The lean card row the admin `allCards` endpoint returns. */
export interface AdminSearchableCard extends SearchableCard {
  types: string[];
}

/**
 * The admin pickers' card lookup: same ranked matcher as everywhere else, but
 * over the lean `allCards` list instead of the catalog. That list carries no
 * images, so these rows stay text-only rather than pulling the catalog (the
 * app's largest payload) into pages that deliberately avoid it. Rows are
 * otherwise identical to the catalog pickers' — same component, same layout,
 * just without the thumbnail.
 *
 * Printing codes are unavailable here too, so this matches on names alone.
 *
 * @param cards The admin card list; must be identity-stable (a query result).
 * @param query What the user typed.
 * @returns Ranked results in the shared dropdown's shape.
 */
export function useAdminCardSearch(
  cards: readonly AdminSearchableCard[],
  query: string,
): CardSearchResult[] {
  const matches = useCardSearch(cards, query);
  return matches.map((card) => ({
    id: card.id,
    label: card.name,
    sublabel: card.slug,
    detail: card.types.join(" "),
  }));
}

/** The card row the marketplace mapping endpoints return (`AssignableCardResponse`). */
interface AssignableCard {
  cardId: string;
  cardSlug: string;
  cardName: string;
  setName: string;
  shortCodes: string[];
}

/** How many hits the marketplace assign dropdowns show; their rows are wide. */
const ASSIGNABLE_RESULT_LIMIT = 10;

/**
 * Card lookup for the two marketplace "assign this product to a card" pickers,
 * which share one response shape and previously carried the same hand-rolled
 * substring filter each. Unlike the other admin lists this one ships printing
 * short codes, so an admin can paste `OGN-202` off the product listing instead
 * of retyping a card name.
 *
 * Text-only rows, for the same reason as {@link useAdminCardSearch}: the
 * response carries no image.
 *
 * @param cards The assignable card list; must be identity-stable.
 * @param query What the user typed.
 * @returns Ranked results in the shared dropdown's shape.
 */
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
        // Sorted once here rather than per keystroke; the first code is the
        // one the row shows.
        firstShortCode: card.shortCodes.toSorted((a, b) => a.localeCompare(b))[0] ?? "",
      })),
    [cards],
  );

  const printingsByCardId = useMemo(
    () =>
      new Map(
        cards.map((card) => [
          card.cardId,
          // The list has no public codes, so each short code stands in for both.
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
