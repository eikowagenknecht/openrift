import {
  cardTradeLivePhaseRank,
  cardTradeState,
  isLiveCardTradeStatus,
} from "@openrift/shared/card-trade-lifecycle";
import { enumLabel } from "@openrift/shared/enum-label";
import type {
  CardTradeLiveAnnotation,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import type { FriendGroupMatchRow } from "@openrift/shared/types/api/friend-group";

export type TradeSection = "action-needed" | "active" | "history";

export function tradeSection(trade: CardTradeResponse): TradeSection {
  switch (cardTradeState(trade)) {
    case "to-answer":
    case "to-settle": {
      return "action-needed";
    }
    case "waiting-on-them": {
      return "active";
    }
    case "done":
    case "closed": {
      return "history";
    }
  }
}

function liveTradeKey(counterpartyUserId: string, printingId: string): string {
  return `${counterpartyUserId}:${printingId}`;
}

/**
 * Matches on (counterparty, printing) across all groups. Reserved trades are
 * already netted server-side; this only covers the pending window.
 */
export function withoutLiveTradeMatches<
  TMatch extends { counterpartyUserId: string; printingId: string },
>(matches: readonly TMatch[], trades: readonly CardTradeResponse[]): TMatch[] {
  // Closing an account cancels the trades that account was in, so a live
  // trade with a null counterparty can't happen; treat it as history.
  const live = new Set<string>();
  for (const trade of trades) {
    const counterpartyUserId = trade.counterparty.userId;
    if (isLiveCardTradeStatus(trade.status) && counterpartyUserId !== null) {
      live.add(liveTradeKey(counterpartyUserId, trade.printingId));
    }
  }
  return matches.filter(
    (match) => !live.has(liveTradeKey(match.counterpartyUserId, match.printingId)),
  );
}

export interface MemberTradeBuckets {
  active: CardTradeResponse[];
  actionNeeded: CardTradeResponse[];
  history: CardTradeResponse[];
}

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

export type MatchDirection = "incoming" | "outgoing";

export type MatchSuggestionFields = Pick<
  FriendGroupMatchRow,
  | "buyEntryKind"
  | "buyEntryId"
  | "cardId"
  | "counterpartyUserId"
  | "counterpartyListId"
  | "printingId"
>;

/** Must match the grouping key `groupTradeMatches` uses in match-row-card.tsx. */
export function matchSuggestionKey(direction: MatchDirection, row: MatchSuggestionFields): string {
  // Rule-derived wishes have a null buyEntryId; fall back to cardId so
  // distinct rule wishes don't collapse onto one tile.
  const wishKey = row.buyEntryId ?? row.cardId;
  return row.buyEntryKind === "card"
    ? `card\0${direction}\0${row.counterpartyUserId}\0${wishKey}`
    : `printing\0${direction}\0${row.counterpartyUserId}\0${wishKey}\0${row.counterpartyListId}\0${row.printingId}`;
}

/**
 * No group in the key, so the same card reachable through two shared groups
 * counts as one suggestion, not two.
 */
export function tradeSuggestionKeys(
  incoming: readonly MatchSuggestionFields[],
  outgoing: readonly MatchSuggestionFields[],
): Set<string> {
  const keys = new Set<string>();
  for (const row of incoming) {
    keys.add(matchSuggestionKey("incoming", row));
  }
  for (const row of outgoing) {
    keys.add(matchSuggestionKey("outgoing", row));
  }
  return keys;
}

export function countTradeSuggestions(
  incoming: readonly MatchSuggestionFields[],
  outgoing: readonly MatchSuggestionFields[],
): number {
  return tradeSuggestionKeys(incoming, outgoing).size;
}

export interface GroupMatchPanels<TMatch> {
  slug: string;
  incoming: readonly TMatch[];
  outgoing: readonly TMatch[];
}

export interface GroupSuggestionStrip {
  count: number;
  printingIds: string[];
}

export interface GroupSuggestionStrips {
  incoming: GroupSuggestionStrip;
  outgoing: GroupSuggestionStrip;
}

function suggestionStrip<TMatch extends MatchSuggestionFields>(
  matches: readonly TMatch[],
  direction: MatchDirection,
): GroupSuggestionStrip {
  return {
    count:
      direction === "incoming"
        ? tradeSuggestionKeys(matches, []).size
        : tradeSuggestionKeys([], matches).size,
    printingIds: [...new Set(matches.map((match) => match.printingId))],
  };
}

export function groupSuggestionStripsBySlug<TMatch extends MatchSuggestionFields>(
  groups: readonly GroupMatchPanels<TMatch>[],
  trades: readonly CardTradeResponse[],
): Map<string, GroupSuggestionStrips> {
  return new Map(
    groups.map((group) => [
      group.slug,
      {
        incoming: suggestionStrip(withoutLiveTradeMatches(group.incoming, trades), "incoming"),
        outgoing: suggestionStrip(withoutLiveTradeMatches(group.outgoing, trades), "outgoing"),
      },
    ]),
  );
}

export function describeViewerSource(
  direction: MatchDirection,
  listNames: readonly string[],
): string | null {
  return describeSource("your", direction === "incoming" ? "wishlist" : "tradelist", listNames);
}

export function describeCounterpartySource(
  direction: MatchDirection,
  listNames: readonly string[],
): string | null {
  return describeSource("their", direction === "incoming" ? "tradelist" : "wishlist", listNames);
}

function describeSource(
  owner: "your" | "their",
  kind: "wishlist" | "tradelist",
  listNames: readonly string[],
): string | null {
  const distinct = [...new Set(listNames.filter((name) => name.length > 0))];
  if (distinct.length === 0) {
    return null;
  }
  const capitalized = owner === "your" ? "Your" : "Their";
  if (distinct.length === 1) {
    return `${capitalized} ${kind}: ${distinct[0]}`;
  }
  return `${distinct.length} of ${owner} ${kind}s`;
}

export interface MatchCopyDetail {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
}

/** Mirrors the collection dialog's condition badge. */
export function matchCopyConditionLabel(
  copy: MatchCopyDetail,
  labels: { conditions: Record<string, string>; graders: Record<string, string> },
): string | null {
  if (copy.grader !== null && copy.grade !== null) {
    return `${labels.graders[copy.grader]} ${copy.grade}`;
  }
  if (copy.condition !== null) {
    return enumLabel(labels.conditions, copy.condition);
  }
  return null;
}

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

export function maxTradeQuantity(demandQuantity: number, availableCount: number): number {
  return Math.max(0, Math.min(demandQuantity, availableCount));
}

/** Drops receiver-side annotations when a giver-side one exists for the same printing. */
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
 * Ties on phase favor giver over receiver. Never sum counts across a side:
 * one reserved plus two pending trades on a printing is one copy, not three.
 */
export function collapseTradeAnnotations(
  annotations: readonly CardTradeLiveAnnotation[],
): CardTradeLiveAnnotation | null {
  // Adding a half step ranks giver above receiver at equal phase without
  // crossing into the next phase.
  const rank = (entry: CardTradeLiveAnnotation): number =>
    cardTradeLivePhaseRank(entry.phase) + (entry.role === "giver" ? 0.5 : 0);
  return annotations.reduce<CardTradeLiveAnnotation | null>(
    (best, entry) => (best === null || rank(entry) > rank(best) ? entry : best),
    null,
  );
}

/**
 * Uses the group id while it exists, else the name it was deleted under. Two
 * different deleted groups sharing a name collapse into one identity.
 */
export function tradeGroupKey(trade: Pick<CardTradeResponse, "groupId" | "groupName">): string {
  return trade.groupId ?? `name:${trade.groupName}`;
}

export interface TradeCounterpartyGroup {
  counterparty: CardTradeResponse["counterparty"];
  trades: CardTradeResponse[];
}

export function groupTradesByCounterparty(
  trades: readonly CardTradeResponse[],
): TradeCounterpartyGroup[] {
  const byId = new Map<string, TradeCounterpartyGroup>();
  for (const trade of trades) {
    // A counterparty who deleted their account has no id left, so their
    // snapshotted name is the only identity their finished trades still carry.
    const key = trade.counterparty.userId ?? `name:${trade.counterparty.name ?? ""}`;
    let group = byId.get(key);
    if (!group) {
      group = { counterparty: trade.counterparty, trades: [] };
      byId.set(key, group);
    }
    group.trades.push(trade);
  }
  return [...byId.values()].sort(
    (a, b) =>
      b.trades.length - a.trades.length ||
      (a.counterparty.name ?? "").localeCompare(b.counterparty.name ?? ""),
  );
}

/** hasGet/hasGive distinguish a genuine zero total from an all-unpriced side. */
export interface TradeValueSplit {
  get: number;
  give: number;
  hasGet: boolean;
  hasGive: boolean;
}

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
