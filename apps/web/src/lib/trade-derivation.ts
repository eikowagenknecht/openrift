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

/** One counterparty's trades split into the member-detail page's lifecycle buckets. */
export interface MemberTradeBuckets {
  active: CardTradeResponse[];
  actionNeeded: CardTradeResponse[];
  history: CardTradeResponse[];
}

/**
 * Filters trades to a single counterparty and buckets them by lifecycle, for the
 * member-detail page's trades block. Unlike the match-suggestion overlay — which
 * only surfaces an in-progress trade while a matching suggestion row exists —
 * this keeps every trade with the member, including reserved ones whose copies
 * no longer appear as a match (ADR-019).
 * @param trades The viewer's trades in the group.
 * @param counterpartyUserId The member whose trades to keep.
 * @returns The member's trades split into active / action-needed / history.
 */
export function bucketMemberTrades(
  trades: readonly CardTradeResponse[],
  counterpartyUserId: string,
): MemberTradeBuckets {
  const mine = trades.filter((trade) => trade.counterparty.userId === counterpartyUserId);
  return {
    active: mine.filter((trade) => tradeSection(trade) === "active"),
    actionNeeded: mine.filter((trade) => tradeSection(trade) === "action-needed"),
    history: mine.filter((trade) => tradeSection(trade) === "history"),
  };
}

/** Whether the card flows to the viewer (`incoming`) or away (`outgoing`). */
export type MatchDirection = "incoming" | "outgoing";

/** The match-row fields a suggestion is keyed on. */
export type MatchSuggestionFields = Pick<
  FriendGroupMatchRow,
  | "buyEntryKind"
  | "buyEntryId"
  | "cardId"
  | "counterpartyUserId"
  | "counterpartyListId"
  | "printingId"
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
  // Rule-derived wishes have a null buyEntryId (no list_entries row, ADR-034);
  // fall back to the wish's own identity (cardId for card wishes) so distinct
  // rule wishes don't collapse onto one tile.
  const wishKey = row.buyEntryId ?? row.cardId;
  return row.buyEntryKind === "card"
    ? `card\0${direction}\0${row.counterpartyUserId}\0${wishKey}`
    : `printing\0${direction}\0${row.counterpartyUserId}\0${wishKey}\0${row.counterpartyListId}\0${row.printingId}`;
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

/**
 * The trades hub's headline and sub-line, shared by the group overview's hub
 * band and the Trades page's summary band so the two never disagree. Leads
 * with the trades awaiting the viewer's action when there are any, otherwise
 * with the possible trades the matcher found.
 * @param actionCount Trades currently waiting on the viewer.
 * @param matchCount Distinct match suggestions (see {@link countTradeSuggestions}).
 * @param activeCount Trades in progress (accepted or awaiting the other side).
 * @returns The headline number and the sub-line that qualifies it.
 */
export function tradesHubSummary(
  actionCount: number,
  matchCount: number,
  activeCount: number,
): { headline: number; sub: string } {
  if (actionCount > 0) {
    return {
      headline: actionCount,
      sub: `${actionCount === 1 ? "trade needs" : "trades need"} your action${
        matchCount > 0 ? ` · ${matchCount} possible` : ""
      }`,
    };
  }
  return {
    headline: matchCount,
    sub:
      matchCount > 0
        ? `possible ${matchCount === 1 ? "trade" : "trades"} · none waiting on you`
        : activeCount > 0
          ? "no new matches right now"
          : "no open trades right now",
  };
}

/**
 * A short label naming which of the viewer's own lists produced a match
 * suggestion: their wish list for an incoming card (they want it), their trade
 * list for an outgoing one (they have it). A grouped suggestion can span several
 * of the viewer's lists (e.g. different printings held in different trade
 * lists), so more than one distinct name collapses to a count.
 * @param direction Whether the card flows to the viewer or away.
 * @param listNames The viewer's source-list name per variant (may repeat).
 * @returns The source-list label, or null when no name is known.
 */
export function describeViewerSource(
  direction: MatchDirection,
  listNames: readonly string[],
): string | null {
  const kind = direction === "incoming" ? "wishlist" : "tradelist";
  const distinct = [...new Set(listNames.filter((name) => name.length > 0))];
  if (distinct.length === 0) {
    return null;
  }
  if (distinct.length === 1) {
    return `Your ${kind}: ${distinct[0]}`;
  }
  return `${distinct.length} of your ${kind}s`;
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

/** One counterparty's trades, kept together so the Trades tab can show one
 * per-person header (avatar, count, value) above their rows. */
export interface TradeCounterpartyGroup {
  counterparty: CardTradeResponse["counterparty"];
  trades: CardTradeResponse[];
}

/**
 * Buckets trades by counterparty so the Trades tab can group a pile of requests
 * to one person under a single header. Trades keep their input order within a
 * group; groups are ordered biggest first (most trades), then by name, so the
 * heaviest pile — the one the grouping most helps — sits at the top.
 * @param trades The trades in one lifecycle bucket.
 * @returns One group per counterparty.
 */
export function groupTradesByCounterparty(
  trades: readonly CardTradeResponse[],
): TradeCounterpartyGroup[] {
  const byId = new Map<string, TradeCounterpartyGroup>();
  for (const trade of trades) {
    let group = byId.get(trade.counterparty.userId);
    if (!group) {
      group = { counterparty: trade.counterparty, trades: [] };
      byId.set(trade.counterparty.userId, group);
    }
    group.trades.push(trade);
  }
  return [...byId.values()].sort(
    (a, b) =>
      b.trades.length - a.trades.length ||
      (a.counterparty.name ?? "").localeCompare(b.counterparty.name ?? ""),
  );
}

/** A per-person estimated value, split by which way the cards flow. `get` is the
 * value coming to the viewer, `give` the value leaving; the `has*` flags say
 * whether any priced item contributed, so an all-unpriced side stays hidden
 * rather than reading as "≈0". */
export interface TradeValueSplit {
  get: number;
  give: number;
  hasGet: boolean;
  hasGive: boolean;
}

/**
 * Sums the estimated market value of a set of trades, split by direction. A
 * receiver-role trade brings the card to the viewer (`get`); a giver-role trade
 * sends it away (`give`). Unpriced printings are skipped, exactly as the per-row
 * price does, so the total is a rough estimate over what's priced.
 * @param trades The trades to value.
 * @param unitPrice Per-copy price lookup at the viewer's marketplace, or undefined.
 * @returns The get/give value split.
 */
export function sumTradeValues(
  trades: readonly CardTradeResponse[],
  unitPrice: (printingId: string) => number | undefined,
): TradeValueSplit {
  const split: TradeValueSplit = { get: 0, give: 0, hasGet: false, hasGive: false };
  for (const trade of trades) {
    const unit = unitPrice(trade.printingId);
    if (unit === undefined) {
      continue;
    }
    const value = unit * trade.quantity;
    if (trade.role === "receiver") {
      split.get += value;
      split.hasGet = true;
    } else {
      split.give += value;
      split.hasGive = true;
    }
  }
  return split;
}
