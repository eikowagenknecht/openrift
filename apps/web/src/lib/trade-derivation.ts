import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeResponse,
  FriendGroupMatchRow,
} from "@openrift/shared";

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
 * regardless of direction and regardless of group — pass the viewer's trades
 * across all groups, so a request opened with a member in one shared group also
 * hides the identical suggestion in every other group (reserved trades are
 * already netted out server-side; this covers the pending window). Only
 * `counterpartyUserId` and `printingId` are read from each match, so callers
 * can pass full match rows or minimal stubs.
 * @param matches The match rows to filter.
 * @param trades The viewer's trades, across all groups.
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

/** The per-copy metadata a match row surfaces about an offered copy (ADR-038). */
export interface MatchCopyDetail {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
}

/**
 * The display label for one offered copy's condition slot: grader + grade when
 * slabbed ("PSA 9"), the condition label otherwise, or null when the copy
 * records neither — mirroring the collection dialog's condition badge.
 * @param copy The copy's metadata.
 * @param labels Slug-to-label maps for conditions and graders.
 * @returns The label, or null when nothing is recorded.
 */
export function matchCopyConditionLabel(
  copy: MatchCopyDetail,
  labels: { conditions: Record<string, string>; graders: Record<string, string> },
): string | null {
  if (copy.grader !== null && copy.grade !== null) {
    return `${labels.graders[copy.grader]} ${copy.grade}`;
  }
  if (copy.condition !== null) {
    return labels.conditions[copy.condition];
  }
  return null;
}

/**
 * Summarizes the offered copies' recorded metadata for one suggestion tile.
 * Condition/grade labels collapse to per-label counts ("Near Mint ×2 · PSA 9");
 * copies recording neither only surface as "not recorded" next to recorded
 * ones, so an all-unrecorded stack (the common case) produces no summary at
 * all. Notes dedupe to the distinct non-empty public notes across the copies.
 * @param copies The aggregated tile's per-copy metadata.
 * @param labelOf Resolves one copy to its condition/grade display label ("Near
 * Mint", "PSA 9"), or null when the copy records neither.
 * @returns The condition summary (null when no copy records one) and the distinct public notes.
 */
export function summarizeMatchCopies(
  copies: readonly MatchCopyDetail[],
  labelOf: (copy: MatchCopyDetail) => string | null,
): { conditions: string | null; notes: string[] } {
  const counts = new Map<string, number>();
  let unrecorded = 0;
  for (const copy of copies) {
    const label = labelOf(copy);
    if (label === null) {
      unrecorded += 1;
    } else {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const notes = [
    ...new Set(
      copies.map((copy) => copy.notesPublic?.trim() ?? "").filter((note) => note.length > 0),
    ),
  ];
  if (counts.size === 0) {
    return { conditions: null, notes };
  }
  const withCount = (label: string, count: number): string =>
    count > 1 ? `${label} ×${count}` : label;
  const parts = [...counts.entries()].map(([label, count]) => withCount(label, count));
  if (unrecorded > 0) {
    parts.push(withCount("not recorded", unrecorded));
  }
  return { conditions: parts.join(" · "), notes };
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

/**
 * Live-trade phases from least to most committed, matching the server ladder in
 * `apps/api/src/lib/card-trade-presenters.ts`. `asked` is a bid nobody acted on,
 * `offered` already consumes the giver's supply, `reserved` has copies pinned,
 * `traded` means the cards changed hands.
 */
const LIVE_PHASE_ORDER: readonly CardTradeLivePhase[] = ["asked", "offered", "reserved", "traded"];

/** @returns How committed a phase is; higher wins a collapse. */
function phaseRank(phase: CardTradeLivePhase): number {
  return LIVE_PHASE_ORDER.indexOf(phase);
}

/**
 * Indexes the flat live-trade annotations by printing so a card cell can look
 * up its own without scanning. The value is always an array: `uq_card_trades_live`
 * is unique per (group, giver, receiver, printing), so one printing can carry
 * several live trades at once, in different phases.
 *
 * Receiver-side annotations are dropped for any printing that also has a
 * giver-side one. That pair is not a data bug, it is the normal result of
 * accepting a trade: `ownedCountsByPrinting` in
 * `packages/shared/src/list-rule-eval.ts` skips reserved copies when netting a
 * `netOwned` wish rule, so pinning copies away raises the same card's shortfall
 * on a rule-driven wishlist and can open a request for it. Both annotations are
 * correct, but "Reserved" and "Requested" on one card at one moment reads as
 * broken, and the copy the viewer is giving away is the one they care about.
 * @param annotations The viewer's live-trade annotations, in any order.
 * @returns Printing id to its surviving annotations, in input order.
 */
export function groupTradeAnnotationsByPrinting(
  annotations: readonly CardTradeLiveAnnotation[],
): Map<string, CardTradeLiveAnnotation[]> {
  const byPrinting = Map.groupBy(annotations, (annotation) => annotation.printingId);
  for (const [printingId, group] of byPrinting) {
    if (group.some((entry) => entry.role === "giver")) {
      byPrinting.set(
        printingId,
        group.filter((entry) => entry.role === "giver"),
      );
    }
  }
  return byPrinting;
}

/**
 * Picks the single annotation a surface with room for only one marker should
 * show, most committed phase first. Ties on phase keep the viewer's own copies
 * (`giver`) ahead of a card coming to them, matching the suppression in
 * {@link groupTradeAnnotationsByPrinting}.
 *
 * The counts stay the winning bucket's own. Summing the whole side into them
 * would overstate the commitment, which is the one thing this feature exists to
 * prevent: a printing with one reserved trade and two asked ones is one copy
 * committed, not three, and a chip reading "Reserved 3" would be a lie. A
 * surface that also wants the side total has the full array from
 * {@link groupTradeAnnotationsByPrinting} and can sum it there.
 *
 * The endpoint emits one row per (printing, role, phase), so the winner is
 * already the whole of its bucket.
 * @param annotations One printing's annotations.
 * @returns The most committed annotation, or null when there is nothing to show.
 */
export function collapseTradeAnnotations(
  annotations: readonly CardTradeLiveAnnotation[],
): CardTradeLiveAnnotation | null {
  // Rank giver above receiver at equal phase by adding a half step, which keeps
  // the whole comparison one number and never crosses into the next phase.
  const rank = (entry: CardTradeLiveAnnotation): number =>
    phaseRank(entry.phase) + (entry.role === "giver" ? 0.5 : 0);
  return annotations.reduce<CardTradeLiveAnnotation | null>(
    (best, entry) => (best === null || rank(entry) > rank(best) ? entry : best),
    null,
  );
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
