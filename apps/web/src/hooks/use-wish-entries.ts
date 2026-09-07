import type { ListDetailResponse } from "@openrift/shared/types/api/list";
import { useQueries, useQuery } from "@tanstack/react-query";

import { listDetailQueryOptions, listsQueryOptions } from "@/hooks/use-lists";
import { useUserId } from "@/lib/auth-session";
import type { WishEntryFlat } from "@/lib/wish-entry";

/** The viewer's wish-list membership, queried for highlighting + post-take cleanup. */
export interface WishMembership {
  /**
   * Wish entries matching the given printing. A card-kind wish matches any
   * printing of the card; a printing-kind wish matches the exact printing.
   */
  entriesForPrinting: (cardId: string, printingId: string) => WishEntryFlat[];
  matches: (cardId: string, printingId: string) => boolean;
  wishedQuantity: (cardId: string, printingId: string) => number;
}

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
      // Rule-derived entries have no list_entries row, so they aren't
      // individually removable; only manual entries are.
      if (entry.id === null) {
        continue;
      }
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

/** Safe on surfaces that render for logged-out visitors: with no signed-in user it stays empty and fetches nothing. */
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
