import type { DeckListItemResponse } from "@openrift/shared";
import { formatDay } from "@openrift/shared";

export type DeckMetaPartKey = "box" | "missing" | "value" | "updated";

export interface DeckMetaPart {
  key: DeckMetaPartKey;
  /** Display text, or null when the fact doesn't apply to this deck. */
  text: string | null;
  /** Longer text for the inline rendering, where a bare date reads ambiguously. */
  inlineText?: string;
  /** Marks the parts the surfaces render in amber. */
  warn?: boolean;
  /** Hover context, currently the created date behind the updated one. */
  title?: string;
}

/**
 * Where the deck is stored, worded as a fact rather than a bare name: these
 * surfaces carry no headers, so the preposition is what stops the box reading
 * as another deck's name. Its own export because the list row places it beside
 * the deck name instead of in the stat columns, while the tile and the phone
 * row take it from {@link deckMetaParts} like every other fact.
 * @returns The box part, with `text` null when the deck lives nowhere.
 */
export function deckBoxPart(boxName?: string | null): DeckMetaPart {
  return {
    key: "box",
    text: boxName ? `in ${boxName}` : null,
    title: boxName ? `Stored in ${boxName}` : undefined,
  };
}

/**
 * The deck-list stat sequence, in the order the deck hero established: where
 * the deck is stored, then the actionable ownership gap before the price, with
 * the date trailing. Both the grid tile and the list row render this array, so
 * their order cannot drift apart again. The card count is deliberately absent —
 * like the hero, these surfaces carry the build figure on the format badge
 * instead.
 * @returns All parts in canonical order, with `text` null where the deck has
 * nothing to say (no deck box, no missing cards, no price, a local deck with no
 * server inventory). Callers drop those parts inline and show a dash in columns.
 */
export function deckMetaParts(
  item: DeckListItemResponse,
  formatPrice: (cents: number) => string,
  /** Name of the collection the deck is stored in, resolved by the caller. */
  boxName?: string | null,
): DeckMetaPart[] {
  const { deck, totalValueCents, missingCount } = item;
  const createdDate = formatDay(deck.createdAt);
  const updatedDate = formatDay(deck.updatedAt);

  return [
    deckBoxPart(boxName),
    {
      key: "missing",
      text: missingCount !== null && missingCount > 0 ? `${missingCount} missing` : null,
      warn: true,
    },
    {
      key: "value",
      text: totalValueCents !== null && totalValueCents > 0 ? formatPrice(totalValueCents) : null,
    },
    {
      key: "updated",
      text: updatedDate,
      inlineText: `updated ${updatedDate}`,
      // The tile used to print both dates, which is what overflowed it. The
      // creation date keeps a home here instead of a second visible column.
      title: updatedDate === createdDate ? undefined : `Created ${createdDate}`,
    },
  ];
}
