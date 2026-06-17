import type { FriendGroupShareableListResponse } from "@openrift/shared";

/** A wishlist a viewer can route a tradelist "I want this" request onto. */
export interface WishlistRequestOption {
  listId: string;
  listName: string;
  /** card-kind matches any printing of the card; printing-kind matches the exact printing. */
  listKind: "card" | "printing";
  entryCount: number;
  /** Already shared with this group → no share confirmation needed. */
  isShared: boolean;
}

/**
 * Narrows a group's shareable lists to the wishlists a viewer can add a card to
 * when requesting it from another member's tradelist, tagging each with whether
 * it is already shared with the group so the picker can show "Shared" vs
 * "Will be shared". Order is preserved.
 *
 * Trade- and organize-intent lists are excluded: requesting a card means putting
 * it on a wishlist, which is what creates the match against the giver's copies.
 *
 * @returns The wishlist options, in input order.
 */
export function wishlistRequestOptions(
  items: readonly FriendGroupShareableListResponse[],
): WishlistRequestOption[] {
  const options: WishlistRequestOption[] = [];
  for (const item of items) {
    if (item.listIntent !== "wish") {
      continue;
    }
    options.push({
      listId: item.listId,
      listName: item.listName,
      // Wishlists are only ever card- or printing-kind, but normalise defensively.
      listKind: item.listKind === "printing" ? "printing" : "card",
      entryCount: item.entryCount,
      isShared: item.sharedAt !== null,
    });
  }
  return options;
}

/** Bulk-add entry payload for a single printing, shaped to a list's kind. */
interface WishEntryPayload {
  cardId?: string;
  printingId?: string;
  quantity: number;
}

/**
 * Builds the bulk-add entry that makes a wishlist match a specific printing:
 * card-kind wishlists are keyed by card id (any printing of the card matches),
 * printing-kind wishlists by the exact printing id.
 *
 * @returns The entry payload for the chosen list's kind.
 */
export function wishEntryForPrinting(
  listKind: "card" | "printing",
  printing: { id: string; cardId: string },
  quantity: number,
): WishEntryPayload {
  const safeQuantity = Math.max(1, Math.floor(quantity));
  return listKind === "printing"
    ? { printingId: printing.id, quantity: safeQuantity }
    : { cardId: printing.cardId, quantity: safeQuantity };
}

/**
 * Picks the wishlist to pre-select in the request picker: prefer one already
 * shared with the group (so the request is one click with no share prompt),
 * otherwise the first wishlist, otherwise `null` (the caller defaults to
 * creating a new list).
 *
 * @returns The pre-selected list id, or `null` when there are no wishlists.
 */
export function preferredWishlistId(options: readonly WishlistRequestOption[]): string | null {
  return (options.find((option) => option.isShared) ?? options[0])?.listId ?? null;
}
