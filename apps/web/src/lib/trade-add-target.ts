import type { CollectionResponse } from "@openrift/shared";

import type { TradeAddTarget } from "@/stores/trade-add-target-store";

/** Where a one-press trade add sends copies, and what the button calls that place. */
export interface ResolvedTradeAddTarget {
  /** The collection to file into; undefined lets the server pick the inbox. */
  collectionId?: string;
  /** Reads after "Add to" on the button. */
  label: string;
}

const INBOX_TARGET: ResolvedTradeAddTarget = { label: "inbox" };

/**
 * Resolves the remembered add target against the viewer's live collections.
 *
 * The remembered name is only a first-paint stand-in: once the collections have
 * loaded, the live row wins, so a renamed collection relabels the button. A
 * remembered collection that is gone (deleted, or on a device that never had
 * it) falls back to the inbox rather than sending copies at a dead id. The
 * inbox itself resolves to the id-less form so the server keeps choosing it,
 * even if its id differs from what was stored.
 * @param remembered The persisted choice, or null when the viewer never picked one.
 * @param collections The viewer's collections, or undefined while they load.
 * @returns The collection to add to and the button's label.
 */
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
