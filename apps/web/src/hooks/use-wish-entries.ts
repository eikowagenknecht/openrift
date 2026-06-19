import type { ListDetailResponse } from "@openrift/shared";
import { useQueries, useQuery } from "@tanstack/react-query";

import { listDetailQueryOptions, listsQueryOptions } from "@/hooks/use-lists";
import { useUserId } from "@/lib/auth-session";

/** A single wish-list entry, flattened with its owning list's name for display. */
export interface WishEntryFlat {
  entryId: string;
  listId: string;
  listName: string;
  kind: "card" | "printing";
  cardId?: string;
  printingId?: string;
  quantity: number;
}

/** The viewer's wish-list membership, queried for highlighting + post-take cleanup. */
export interface WishMembership {
  /**
   * Wish entries matching the given printing. A card-kind wish matches any
   * printing of the card; a printing-kind wish matches the exact printing.
   */
  entriesForPrinting: (cardId: string, printingId: string) => WishEntryFlat[];
  /** Whether the given printing matches any wish entry. */
  matches: (cardId: string, printingId: string) => boolean;
  /** Total quantity wished across the entries matching the given printing (0 = none). */
  wishedQuantity: (cardId: string, printingId: string) => number;
}

/**
 * Flatten wish-list details into per-card and per-printing lookups. Pure so the
 * matching rule can be unit-tested without rendering the query hooks.
 *
 * @returns A {@link WishMembership} bound to the supplied list details.
 */
export function buildWishMembership(details: readonly ListDetailResponse[]): WishMembership {
  const byCardId = new Map<string, WishEntryFlat[]>();
  const byPrintingId = new Map<string, WishEntryFlat[]>();
  const add = (map: Map<string, WishEntryFlat[]>, key: string, value: WishEntryFlat) => {
    const existing = map.get(key);
    if (existing) {
      existing.push(value);
    } else {
      map.set(key, [value]);
    }
  };
  for (const detail of details) {
    for (const entry of detail.entries) {
      if (entry.kind === "card") {
        add(byCardId, entry.cardId, {
          entryId: entry.id,
          listId: detail.list.id,
          listName: detail.list.name,
          kind: "card",
          cardId: entry.cardId,
          quantity: entry.quantity,
        });
      } else if (entry.kind === "printing") {
        add(byPrintingId, entry.printingId, {
          entryId: entry.id,
          listId: detail.list.id,
          listName: detail.list.name,
          kind: "printing",
          printingId: entry.printingId,
          quantity: entry.quantity,
        });
      }
      // copy-kind entries never appear on wish lists (intent×kind constraint).
    }
  }
  const entriesForPrinting = (cardId: string, printingId: string): WishEntryFlat[] => [
    ...(byCardId.get(cardId) ?? []),
    ...(byPrintingId.get(printingId) ?? []),
  ];
  return {
    entriesForPrinting,
    matches: (cardId, printingId) => byCardId.has(cardId) || byPrintingId.has(printingId),
    wishedQuantity: (cardId, printingId) =>
      entriesForPrinting(cardId, printingId).reduce((sum, entry) => sum + entry.quantity, 0),
  };
}

/**
 * The viewer's wish-list membership, for highlighting wanted cards in a group
 * "bulk box" or on a member's tradelist, and offering a post-take wishlist
 * cleanup. Pass `enabled=false` on surfaces that don't need it (e.g. personal
 * collections) to skip every fetch. Safe to call on surfaces that also render
 * for logged-out visitors (e.g. the public shared-list browser): with no signed-in
 * user it stays empty and fetches nothing.
 *
 * @returns A {@link WishMembership}; empty until the wish lists have loaded.
 */
export function useWishEntries(enabled: boolean): WishMembership {
  const userId = useUserId();
  const active = enabled && userId !== null;
  const { data: wishLists } = useQuery({
    ...listsQueryOptions(userId ?? "", "wish"),
    enabled: active,
  });
  const lists = wishLists ?? [];
  const detailResults = useQueries({
    queries: active ? lists.map((list) => listDetailQueryOptions(userId ?? "", list.id)) : [],
  });
  const details = detailResults
    .map((result) => result.data)
    .filter((detail): detail is ListDetailResponse => detail !== undefined);
  return buildWishMembership(details);
}
