import type { FriendGroupBoxWantRow } from "@openrift/shared/types/api/friend-group";

/** The quantity is already netted against live trades server-side. */
export type BoxWantRow = FriendGroupBoxWantRow;

export interface BoxWantsLookup {
  /** Takeable quantity of a printing in one box; 0 when nothing there is wanted. */
  fulfillable: (collectionId: string, printingId: string) => number;
  /** A tile's representative printing may not be the wanted one; this matches by card. */
  wantsCard: (collectionId: string, cardId: string) => boolean;
  /** Across every box when no id is given; a card wanted from two boxes counts once. */
  wantedCardCount: (collectionId?: string) => number;
  /** Ties go to whichever candidate comes first. */
  bestCollection: (collectionIds: readonly string[]) => string | undefined;
}

const KEY_SEPARATOR = ":";

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
