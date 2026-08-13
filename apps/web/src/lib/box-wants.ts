import type { FriendGroupBoxWantRow } from "@openrift/shared";

/**
 * One row of the group box-wants endpoint: a printing sitting in a group-owned
 * "bulk box" that the viewer's wish lists still want, with the quantity the box
 * can actually hand over (already netted against live trades server-side).
 */
export type BoxWantRow = FriendGroupBoxWantRow;

/** Per-box lookups over the group's box-wants rows. */
export interface BoxWantsLookup {
  /** Takeable quantity of a printing in one box; 0 when nothing there is wanted. */
  fulfillable: (collectionId: string, printingId: string) => number;
  /**
   * Whether a box can hand over any printing of a card. The grid's cards view
   * collapses a card's variants into one tile whose representative printing is
   * not necessarily the wanted one, so that view matches on the card instead.
   */
  wantsCard: (collectionId: string, cardId: string) => boolean;
  /**
   * Distinct wanted cards in one box, or across every box when no id is given.
   * A card wanted from two boxes counts once in the total.
   */
  wantedCardCount: (collectionId?: string) => number;
  /**
   * The candidate box holding the most wanted cards, or undefined when none of
   * them holds any. Ties go to whichever candidate comes first.
   */
  bestCollection: (collectionIds: readonly string[]) => string | undefined;
}

/** Separator that cannot occur in a UUID, so the composite key stays unambiguous. */
const KEY_SEPARATOR = ":";

/**
 * Index the box-wants rows for the two surfaces that read them: the collection
 * grid's "Wanted" filter (per printing, or per card in cards view) and the
 * group overview's tile (distinct cards, plus which box to link to).
 * @param items The rows as returned by the endpoint.
 * @returns The lookups described by {@link BoxWantsLookup}.
 */
export function buildBoxWantsLookup(items: readonly BoxWantRow[]): BoxWantsLookup {
  const quantityByPrinting = new Map<string, number>();
  const cardsByCollection = new Map<string, Set<string>>();
  const allCards = new Set<string>();

  for (const item of items) {
    const key = `${item.collectionId}${KEY_SEPARATOR}${item.printingId}`;
    quantityByPrinting.set(key, (quantityByPrinting.get(key) ?? 0) + item.fulfillableQuantity);
    const cards = cardsByCollection.get(item.collectionId);
    if (cards) {
      cards.add(item.cardId);
    } else {
      cardsByCollection.set(item.collectionId, new Set([item.cardId]));
    }
    allCards.add(item.cardId);
  }

  const fulfillable = (collectionId: string, printingId: string) =>
    quantityByPrinting.get(`${collectionId}${KEY_SEPARATOR}${printingId}`) ?? 0;

  const wantedCardCount = (collectionId?: string) =>
    collectionId === undefined ? allCards.size : (cardsByCollection.get(collectionId)?.size ?? 0);

  return {
    fulfillable,
    wantsCard: (collectionId, cardId) => cardsByCollection.get(collectionId)?.has(cardId) ?? false,
    wantedCardCount,
    bestCollection: (collectionIds) => {
      let best: string | undefined;
      let bestCount = 0;
      for (const collectionId of collectionIds) {
        const count = wantedCardCount(collectionId);
        if (count > bestCount) {
          best = collectionId;
          bestCount = count;
        }
      }
      return best;
    },
  };
}

/** Shared empty lookup, so surfaces waiting on the query don't rebuild one per render. */
export const EMPTY_BOX_WANTS: BoxWantsLookup = buildBoxWantsLookup([]);
