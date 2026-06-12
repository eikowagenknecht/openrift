import type { CardTradeResponse, FriendGroupMatchRow } from "@openrift/shared";

/** The three buckets the per-group Trades tab groups trades into. */
export type TradeSection = "action-needed" | "active" | "history";

/**
 * Buckets a trade for the Trades tab. Status- and role-derived (via the
 * server-computed `actionNeeded`), independent of the seen/unread flag.
 * @returns The section the trade belongs in.
 */
export function tradeSection(trade: CardTradeResponse): TradeSection {
  // Things the viewer must act on: a request awaiting them, or a completed
  // trade whose own-side sync they haven't resolved.
  if (trade.actionNeeded === "accept-or-decline" || trade.actionNeeded === "apply-sync") {
    return "action-needed";
  }
  // In-flight: their own pending request, or a reserved trade not yet traded.
  if (trade.actionNeeded === "cancel" || trade.actionNeeded === "complete") {
    return "active";
  }
  // Terminal (declined/cancelled/expired) or completed with sync resolved.
  return "history";
}

function liveTradeKey(counterpartyUserId: string, printingId: string): string {
  return `${counterpartyUserId}:${printingId}`;
}

/**
 * Drops match rows that already have a live (pending or reserved) trade with the
 * same member for the same printing, so a suggestion and its in-progress trade
 * don't both appear on the Trades page. Matched on (counterparty, printing)
 * regardless of direction; only `counterpartyUserId` and `printingId` are read
 * from each match, so callers can pass full match rows or minimal stubs.
 * @param matches The match rows to filter.
 * @param trades The viewer's trades in the group.
 * @returns The matches with live-trade duplicates removed.
 */
export function withoutLiveTradeMatches<
  TMatch extends { counterpartyUserId: string; printingId: string },
>(matches: readonly TMatch[], trades: readonly CardTradeResponse[]): TMatch[] {
  const live = new Set(
    trades
      .filter((trade) => trade.status === "pending" || trade.status === "reserved")
      .map((trade) => liveTradeKey(trade.counterparty.userId, trade.printingId)),
  );
  return matches.filter(
    (match) => !live.has(liveTradeKey(match.counterpartyUserId, match.printingId)),
  );
}

/** Whether the card flows to the viewer (`incoming`) or away (`outgoing`). */
export type MatchDirection = "incoming" | "outgoing";

/** The match-row fields a suggestion is keyed on. */
export type MatchSuggestionFields = Pick<
  FriendGroupMatchRow,
  "buyEntryKind" | "buyEntryId" | "counterpartyUserId" | "counterpartyListId" | "printingId"
>;

/**
 * Key identifying one suggestion tile on the Trades page. A card-level wish
 * collapses every printing one counterparty can fill it with into a single
 * suggestion; a printing-level wish stays one suggestion per
 * (counterparty, list, printing). `groupTradeMatches` in match-row-card.tsx
 * groups by this same key, so anything counting suggestions (e.g. the
 * overview's Trades tile) agrees with what the page renders.
 * @returns The grouping key.
 */
export function matchSuggestionKey(direction: MatchDirection, row: MatchSuggestionFields): string {
  return row.buyEntryKind === "card"
    ? `card\0${direction}\0${row.counterpartyUserId}\0${row.buyEntryId}`
    : `printing\0${direction}\0${row.counterpartyUserId}\0${row.buyEntryId}\0${row.counterpartyListId}\0${row.printingId}`;
}

/**
 * Counts the suggestion tiles the Trades page will show for these match rows.
 * The raw match arrays carry one row per physical copy, so their length wildly
 * overstates what the user sees (50 copies of one wanted card is one
 * suggestion, not 50).
 * @returns The number of distinct suggestions across both directions.
 */
export function countTradeSuggestions(
  incoming: readonly MatchSuggestionFields[],
  outgoing: readonly MatchSuggestionFields[],
): number {
  const keys = new Set<string>();
  for (const row of incoming) {
    keys.add(matchSuggestionKey("incoming", row));
  }
  for (const row of outgoing) {
    keys.add(matchSuggestionKey("outgoing", row));
  }
  return keys.size;
}

/** @returns A short human label for a trade status. */
export function tradeStatusLabel(status: CardTradeResponse["status"]): string {
  switch (status) {
    case "pending": {
      return "Pending";
    }
    case "reserved": {
      return "Reserved";
    }
    case "completed": {
      return "Completed";
    }
    case "declined": {
      return "Declined";
    }
    case "cancelled": {
      return "Cancelled";
    }
    case "expired": {
      return "Expired";
    }
  }
}

/**
 * The most copies a single trade can move (and the Request/Offer dialog's default):
 * the amount the wanting side wants, capped by what the having side actually has.
 * You never trade more than is wanted, nor more than is available.
 * @returns The maximum tradeable quantity (0 when nothing is available).
 */
export function maxTradeQuantity(demandQuantity: number, availableCount: number): number {
  return Math.max(0, Math.min(demandQuantity, availableCount));
}
