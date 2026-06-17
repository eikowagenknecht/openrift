import type { FriendGroupShareableListResponse, ListIntent, ListKind } from "@openrift/shared";

/**
 * A list a viewer can route an exchange onto: a wishlist for the "I want this"
 * request flow (intent `wish`), or a tradelist for the "Offer" flow (intent
 * `trade`). Tagged with whether it is already shared with the group so the
 * picker can show "Shared" vs "Will be shared".
 */
export interface ListTargetOption {
  listId: string;
  listName: string;
  listKind: ListKind;
  entryCount: number;
  /** Already shared with this group → no share confirmation needed. */
  isShared: boolean;
}

/**
 * Narrows a group's shareable lists to those of a given intent, preserving input
 * order. Used both ways: `wish` for the lists a request lands on, `trade` for
 * the lists an offer lands on.
 *
 * @returns The matching list options, in input order.
 */
export function listTargetOptions(
  items: readonly FriendGroupShareableListResponse[],
  intent: ListIntent,
): ListTargetOption[] {
  const options: ListTargetOption[] = [];
  for (const item of items) {
    if (item.listIntent !== intent) {
      continue;
    }
    options.push({
      listId: item.listId,
      listName: item.listName,
      listKind: item.listKind,
      entryCount: item.entryCount,
      isShared: item.sharedAt !== null,
    });
  }
  return options;
}

/** Bulk-add entry payload for a single printing, shaped to a list's kind. */
interface PrintingEntryPayload {
  cardId?: string;
  printingId?: string;
  quantity: number;
}

/**
 * Builds the bulk-add entry that makes a wishlist match a specific printing:
 * card-kind wishlists are keyed by card id (any printing of the card matches),
 * printing-kind wishlists by the exact printing id. Used by the request flow;
 * the offer flow adds owned copies by `copyId` instead.
 *
 * @returns The entry payload for the chosen list's kind.
 */
export function entryForPrinting(
  listKind: "card" | "printing",
  printing: { id: string; cardId: string },
  quantity: number,
): PrintingEntryPayload {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  return listKind === "printing"
    ? { printingId: printing.id, quantity: safeQuantity }
    : { cardId: printing.cardId, quantity: safeQuantity };
}

/**
 * Picks the list to pre-select in an exchange picker: prefer one already shared
 * with the group (so it is one click with no share prompt), otherwise the first
 * list, otherwise `null` (the caller defaults to creating a new list).
 *
 * @returns The pre-selected list id, or `null` when there are no options.
 */
export function preferredListId(options: readonly ListTargetOption[]): string | null {
  return (options.find((option) => option.isShared) ?? options[0])?.listId ?? null;
}

/** A minimal owned-copy shape: the copy id, its printing, and owning group. */
interface OwnedCopy {
  id: string;
  printingId: string;
  /** Owning group of the copy's collection, or null for personal copies. */
  groupId: string | null;
}

/**
 * Groups the viewer's *personal* owned copies by printing id. Group-owned copies
 * (`groupId !== null`) are excluded: they belong to a shared pool, not the
 * viewer, so they can't be offered in a personal trade.
 *
 * @returns A map from printing id to the personal copy ids of that printing.
 */
export function personalCopyIdsByPrinting(copies: readonly OwnedCopy[]): Map<string, string[]> {
  const byPrinting = new Map<string, string[]>();
  for (const copy of copies) {
    if (copy.groupId !== null) {
      continue;
    }
    const existing = byPrinting.get(copy.printingId);
    if (existing) {
      existing.push(copy.id);
    } else {
      byPrinting.set(copy.printingId, [copy.id]);
    }
  }
  return byPrinting;
}

/** A printing the viewer can offer, with the personal copy ids backing it. */
export interface OfferablePrinting {
  printingId: string;
  copyIds: string[];
}

/**
 * Of the printings that would satisfy a want (the exact printing for a
 * printing-kind wishlist, or every printing of the card for a card-kind one),
 * the ones the viewer personally owns — each with its owned copy ids, ordered
 * most-owned first so an offer picker can default to the printing the viewer has
 * the most of. A stable tiebreak by printing id keeps the order deterministic.
 *
 * @returns The offerable printings, most-owned first; empty when none are owned.
 */
export function offerablePrintings(
  candidatePrintingIds: readonly string[],
  copyIdsByPrinting: ReadonlyMap<string, readonly string[]>,
): OfferablePrinting[] {
  const offerable: OfferablePrinting[] = [];
  for (const printingId of candidatePrintingIds) {
    const copyIds = copyIdsByPrinting.get(printingId);
    if (copyIds && copyIds.length > 0) {
      offerable.push({ printingId, copyIds: [...copyIds] });
    }
  }
  return offerable.toSorted((a, b) => {
    if (b.copyIds.length !== a.copyIds.length) {
      return b.copyIds.length - a.copyIds.length;
    }
    return a.printingId.localeCompare(b.printingId);
  });
}
