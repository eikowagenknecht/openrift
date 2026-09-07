import type {
  CardTradeResponse,
  FriendGroupShareableListResponse,
  ListIntent,
  ListKind,
} from "@openrift/shared";

export interface PendingRequest {
  tradeId: string;
  quantity: number;
}

// Only `pending` requests are included; `reserved` and terminal trades don't apply.
// uq_card_trades_live caps live trades at one per printing+member.
export function pendingRequestsByPrinting(
  trades: readonly CardTradeResponse[],
  groupSlug: string,
  counterpartyUserId: string,
): Map<string, PendingRequest> {
  const requests = new Map<string, PendingRequest>();
  for (const trade of trades) {
    if (
      trade.groupSlug === groupSlug &&
      trade.counterparty.userId === counterpartyUserId &&
      trade.role === "receiver" &&
      trade.status === "pending"
    ) {
      const existing = requests.get(trade.printingId);
      if (existing) {
        existing.quantity += trade.quantity;
      } else {
        requests.set(trade.printingId, { tradeId: trade.id, quantity: trade.quantity });
      }
    }
  }
  return requests;
}

export interface ListTargetOption {
  listId: string;
  listName: string;
  listKind: ListKind;
  entryCount: number;
  isShared: boolean;
}

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

const LIST_KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "card", plural: "cards" },
  printing: { singular: "printing", plural: "printings" },
  copy: { singular: "copy", plural: "copies" },
};

export function listKindNoun(kind: ListKind, count: number): string {
  const noun = LIST_KIND_NOUN[kind];
  return count === 1 ? noun.singular : noun.plural;
}

// A new wishlist is printing-kind, since card-kind would match every printing
// of the card. An existing list keeps its kind, narrowed since wishlists are
// never copy-kind.
export function requestListKind(chosen?: ListTargetOption): "card" | "printing" {
  if (!chosen) {
    return "printing";
  }
  return chosen.listKind === "printing" ? "printing" : "card";
}

interface PrintingEntryPayload {
  cardId?: string;
  printingId?: string;
  quantity: number;
}

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

export function preferredListId(options: readonly ListTargetOption[]): string | null {
  return (options.find((option) => option.isShared) ?? options[0])?.listId ?? null;
}

interface OwnedCopy {
  id: string;
  printingId: string;
  groupId: string | null;
}

// Group-owned copies belong to a shared pool, not the viewer, so they can't
// be offered in a personal trade.
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

export interface OfferablePrinting {
  printingId: string;
  copyIds: string[];
}

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
