import {
  cardTradeState,
  isTradedCardTrade,
  needsViewerAction,
} from "@openrift/shared/card-trade-lifecycle";
import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";

import { distinctPrintingIds } from "./friend-group-activity";
import type { MatchDirection, MatchSuggestionFields } from "./trade-derivation";
import { tradeSuggestionKeys, withoutLiveTradeMatches } from "./trade-derivation";

function isInFlightTrade(trade: CardTradeResponse): boolean {
  const state = cardTradeState(trade);
  return state === "to-answer" || state === "to-settle" || state === "waiting-on-them";
}

export interface NeedsYouCounts {
  toAnswer: number;
  toHandOver: number;
  toReceive: number;
}

export function needsYouCounts(needsYou: readonly CardTradeResponse[]): NeedsYouCounts {
  let toAnswer = 0;
  let toHandOver = 0;
  let toReceive = 0;
  for (const trade of needsYou) {
    if (trade.actionNeeded === "accept-or-decline") {
      toAnswer += 1;
    } else if (trade.actionNeeded === "settle") {
      if (trade.role === "giver") {
        toHandOver += 1;
      } else {
        toReceive += 1;
      }
    }
  }
  return { toAnswer, toHandOver, toReceive };
}

const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

export function expiringSoonCount(
  needsYou: readonly CardTradeResponse[],
  now: Date = new Date(),
): number {
  const deadline = now.getTime() + EXPIRING_SOON_MS;
  return needsYou.filter(
    (trade) =>
      trade.actionNeeded === "accept-or-decline" &&
      trade.expiresAt !== null &&
      new Date(trade.expiresAt).getTime() <= deadline,
  ).length;
}

function needsYouRank(trade: CardTradeResponse): number {
  return trade.actionNeeded === "accept-or-decline" ? 0 : 1;
}

function compareExpiry(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a.localeCompare(b);
}

export function compareNeedsYou(a: CardTradeResponse, b: CardTradeResponse): number {
  const byRank = needsYouRank(a) - needsYouRank(b);
  if (byRank !== 0) {
    return byRank;
  }
  if (needsYouRank(a) === 0) {
    const byExpiry = compareExpiry(a.expiresAt, b.expiresAt);
    if (byExpiry !== 0) {
      return byExpiry;
    }
  }
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function sortNeedsYou(trades: readonly CardTradeResponse[]): CardTradeResponse[] {
  return trades.toSorted(compareNeedsYou);
}

export function needsYouLine(
  needsYou: readonly CardTradeResponse[],
  now: Date = new Date(),
): string | null {
  if (needsYou.length === 0) {
    return null;
  }
  const { toAnswer, toHandOver, toReceive } = needsYouCounts(needsYou);
  const acts: string[] = [];
  if (toAnswer > 0) {
    acts.push(`${toAnswer} to answer`);
  }
  if (toHandOver > 0) {
    acts.push(`${toHandOver} to hand over`);
  }
  if (toReceive > 0) {
    // Matches the overview band's "To confirm" label for the same stage.
    acts.push(`${toReceive} to confirm`);
  }
  const parts = [acts.join(", ")];
  const soon = expiringSoonCount(needsYou, now);
  if (soon > 0) {
    parts.push(`${soon} ${soon === 1 ? "expires" : "expire"} soon`);
  }
  return parts.join(" · ");
}

export interface TradeHubMember {
  userId: string;
  userName: string | null;
}

interface TradeHubShare {
  userId: string;
  listIntent: "wish" | "trade" | "organize";
}

export interface TradeHubCard<TMember> {
  member: TMember;
  needsYou: CardTradeResponse[];
  open: CardTradeResponse[];
  trades: CardTradeResponse[];
  suggestions: number;
  suggestionsElsewhere: number;
  listCount: number;
  tradedCount: number;
  elsewhereCount: number;
}

export interface TradeHubCardsInput<TMember, TMatch> {
  viewerId: string;
  groupId: string;
  members: readonly TMember[];
  groupTrades: readonly CardTradeResponse[];
  allTrades: readonly CardTradeResponse[];
  incoming: readonly TMatch[];
  outgoing: readonly TMatch[];
  elsewhereIncoming: readonly TMatch[];
  elsewhereOutgoing: readonly TMatch[];
  shares: readonly TradeHubShare[];
}

function memberSortName(member: TradeHubMember): string {
  return member.userName ?? "\u{FFFF}";
}

function cardRank(card: TradeHubCard<TradeHubMember>): number {
  if (card.needsYou.length > 0) {
    return 0;
  }
  if (card.open.length > 0) {
    return 1;
  }
  if (card.suggestions > 0 || card.suggestionsElsewhere > 0) {
    return 2;
  }
  if (card.listCount > 0) {
    return 3;
  }
  return 4;
}

function possibleTrades(count: number): string {
  return `${count} possible ${count === 1 ? "trade" : "trades"}`;
}

export function suggestionsLine(card: TradeHubCard<TradeHubMember>): string | null {
  const groups = card.suggestionsElsewhere === 1 ? "another group" : "other groups";
  if (card.suggestions === 0) {
    return card.suggestionsElsewhere === 0
      ? null
      : `${possibleTrades(card.suggestionsElsewhere)} in ${groups}`;
  }
  return card.suggestionsElsewhere === 0
    ? possibleTrades(card.suggestions)
    : `${possibleTrades(card.suggestions)} · ${card.suggestionsElsewhere} more in ${groups}`;
}

export function isQuietTradeHubCard(card: TradeHubCard<TradeHubMember>): boolean {
  return cardRank(card) === 4 && card.tradedCount === 0 && card.elsewhereCount === 0;
}

export function buildTradeHubCards<
  TMember extends TradeHubMember,
  TMatch extends MatchSuggestionFields,
>(input: TradeHubCardsInput<TMember, TMatch>): TradeHubCard<TMember>[] {
  const incomingByPerson = Map.groupBy(
    withoutLiveTradeMatches(input.incoming, input.allTrades),
    (match) => match.counterpartyUserId,
  );
  const outgoingByPerson = Map.groupBy(
    withoutLiveTradeMatches(input.outgoing, input.allTrades),
    (match) => match.counterpartyUserId,
  );
  const elsewhereIncomingByPerson = Map.groupBy(
    withoutLiveTradeMatches(input.elsewhereIncoming, input.allTrades),
    (match) => match.counterpartyUserId,
  );
  const elsewhereOutgoingByPerson = Map.groupBy(
    withoutLiveTradeMatches(input.elsewhereOutgoing, input.allTrades),
    (match) => match.counterpartyUserId,
  );
  const tradesByPerson = Map.groupBy(input.groupTrades, (trade) => trade.counterparty.userId);
  const elsewhereByPerson = Map.groupBy(
    input.allTrades.filter((trade) => trade.groupId !== input.groupId && isInFlightTrade(trade)),
    (trade) => trade.counterparty.userId,
  );
  const listsByPerson = Map.groupBy(
    input.shares.filter((share) => share.listIntent === "wish" || share.listIntent === "trade"),
    (share) => share.userId,
  );

  const cards = input.members
    .filter((member) => member.userId !== input.viewerId)
    .map((member) => {
      const trades = tradesByPerson.get(member.userId) ?? [];
      const here = tradeSuggestionKeys(
        incomingByPerson.get(member.userId) ?? [],
        outgoingByPerson.get(member.userId) ?? [],
      );
      const elsewhere = tradeSuggestionKeys(
        elsewhereIncomingByPerson.get(member.userId) ?? [],
        elsewhereOutgoingByPerson.get(member.userId) ?? [],
      );
      return {
        member,
        needsYou: sortNeedsYou(trades.filter((trade) => needsViewerAction(trade))),
        open: trades.filter((trade) => cardTradeState(trade) === "waiting-on-them"),
        trades,
        suggestions: here.size,
        suggestionsElsewhere: [...elsewhere].filter((key) => !here.has(key)).length,
        listCount: (listsByPerson.get(member.userId) ?? []).length,
        tradedCount: trades.filter((trade) => isTradedCardTrade(trade)).length,
        elsewhereCount: (elsewhereByPerson.get(member.userId) ?? []).length,
      };
    });

  return cards.toSorted(
    (a, b) =>
      cardRank(a) - cardRank(b) || memberSortName(a.member).localeCompare(memberSortName(b.member)),
  );
}

type TradeShelfRowKey = "answer" | "hand-over" | "confirm" | "could-get" | "would-want";

export interface TradeShelfRow {
  key: TradeShelfRowKey;
  label: string;
  tone: "warning" | "success";
  printingIds: string[];
  detail: string;
}

export interface TradeShelf {
  rows: TradeShelfRow[];
  waitingPeople: number;
  headline: string;
}

function memberPhrase(names: readonly string[]): string {
  if (names.length === 1) {
    return names[0] ?? "a member";
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.length} members`;
}

function counterpartyNames(trades: readonly CardTradeResponse[]): string[] {
  const names = new Set<string>();
  for (const trade of trades) {
    names.add(trade.counterparty.name ?? "a member");
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function cardNoun(count: number): string {
  return count === 1 ? "card" : "cards";
}

function memberNoun(count: number): string {
  return count === 1 ? "member" : "members";
}

function obligationDetail(
  key: Extract<TradeShelfRowKey, "answer" | "hand-over" | "confirm">,
  count: number,
  who: string,
): string {
  if (key === "answer") {
    return `${count} ${count === 1 ? "request" : "requests"} from ${who}`;
  }
  if (key === "hand-over") {
    return `${count} ${cardNoun(count)} for ${who}`;
  }
  return `${count} ${cardNoun(count)} from ${who}`;
}

function obligationRow(
  key: Extract<TradeShelfRowKey, "answer" | "hand-over" | "confirm">,
  label: string,
  trades: readonly CardTradeResponse[],
  tail: string,
): TradeShelfRow | null {
  if (trades.length === 0) {
    return null;
  }
  const detail = obligationDetail(key, trades.length, memberPhrase(counterpartyNames(trades)));
  return {
    key,
    label,
    tone: "warning",
    printingIds: distinctPrintingIds(trades),
    detail: tail === "" ? detail : `${detail}, ${tail}`,
  };
}

function suggestionRow(
  key: Extract<TradeShelfRowKey, "could-get" | "would-want">,
  label: string,
  matches: readonly MatchSuggestionFields[],
  direction: MatchDirection,
): TradeShelfRow | null {
  const count =
    direction === "incoming"
      ? tradeSuggestionKeys(matches, []).size
      : tradeSuggestionKeys([], matches).size;
  if (count === 0) {
    return null;
  }
  const members = new Set(matches.map((match) => match.counterpartyUserId)).size;
  const detail =
    key === "could-get"
      ? `${count} ${cardNoun(count)} from ${members} ${memberNoun(members)}`
      : `${count} ${cardNoun(count)}, wanted by ${members} ${memberNoun(members)}`;
  return { key, label, tone: "success", printingIds: distinctPrintingIds(matches), detail };
}

export function buildTradeShelf({
  needsYou,
  incoming,
  outgoing,
  now,
}: {
  needsYou: readonly CardTradeResponse[];
  incoming: readonly MatchSuggestionFields[];
  outgoing: readonly MatchSuggestionFields[];
  now?: Date;
}): TradeShelf {
  const sorted = sortNeedsYou(needsYou);
  const soon = expiringSoonCount(sorted, now);
  const expiry = soon === 0 ? "" : `${soon} ${soon === 1 ? "expires" : "expire"} soon`;

  const rows = [
    obligationRow(
      "answer",
      "To answer",
      sorted.filter((trade) => trade.actionNeeded === "accept-or-decline"),
      expiry,
    ),
    obligationRow(
      "hand-over",
      "To hand over",
      sorted.filter((trade) => trade.actionNeeded === "settle" && trade.role === "giver"),
      "",
    ),
    obligationRow(
      "confirm",
      "To confirm",
      sorted.filter((trade) => trade.actionNeeded === "settle" && trade.role === "receiver"),
      "",
    ),
    suggestionRow("could-get", "You could get", incoming, "incoming"),
    suggestionRow("would-want", "They would want", outgoing, "outgoing"),
  ].filter((row) => row !== null);

  const waitingPeople = counterpartyNames(sorted).length;
  return {
    rows,
    waitingPeople,
    headline:
      waitingPeople > 0
        ? `${waitingPeople} ${waitingPeople === 1 ? "person is" : "people are"} waiting on you`
        : rows.length > 0
          ? "Nothing waiting on you"
          : "No matches in this group yet",
  };
}
