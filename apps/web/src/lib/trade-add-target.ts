import type { CollectionResponse } from "@openrift/shared";

export interface TradeAddTarget {
  id: string;
  name: string;
}

export interface ResolvedTradeAddTarget {
  collectionId?: string;
  label: string;
}

const INBOX_TARGET: ResolvedTradeAddTarget = { label: "inbox" };

/** The inbox always resolves to the id-less form, even once its live id is known, so the server keeps choosing it. */
export function resolveTradeAddTarget(
  remembered: TradeAddTarget | null,
  collections: readonly CollectionResponse[] | undefined,
): ResolvedTradeAddTarget {
  if (remembered === null) {
    return INBOX_TARGET;
  }
  if (collections === undefined) {
    return { collectionId: remembered.id, label: remembered.name };
  }
  const live = collections.find((collection) => collection.id === remembered.id);
  if (live === undefined || live.isInbox) {
    return INBOX_TARGET;
  }
  return { collectionId: live.id, label: live.name };
}
