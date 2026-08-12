import type { CardTradeResponse } from "@openrift/shared";

import type { MatchSuggestionFields } from "./trade-derivation";
import { countTradeSuggestions, withoutLiveTradeMatches } from "./trade-derivation";

/**
 * Whether a trade is waiting on the viewer — the rows a person's card counts as
 * their move. Both of the server's viewer-side actions count: answering a
 * request, and settling a swap that already happened.
 * @param trade The trade to test.
 * @returns True when the viewer is the one holding it up.
 */
export function isNeedsYouTrade(trade: CardTradeResponse): boolean {
  return trade.actionNeeded === "accept-or-decline" || trade.actionNeeded === "settle";
}

/** The three acts the rows waiting on the viewer ask for. */
export interface NeedsYouCounts {
  /** Requests waiting for a yes or a no. */
  toAnswer: number;
  /** Agreed swaps whose cards the viewer still has to hand over. */
  toHandOver: number;
  /** Agreed swaps whose cards are coming to the viewer, waiting to be received. */
  toReceive: number;
}

/**
 * Splits the rows waiting on the viewer by the act they wait for. A card says
 * them apart rather than showing one total, because deciding on a request at a
 * desk, handing cards over in person and confirming cards that arrived are
 * different errands — a number that mixes them tells you nothing about which
 * one today is. The two settle sides split by the viewer's role: a giver hands
 * over, a receiver receives.
 * @param needsYou The rows waiting on the viewer, as {@link isNeedsYouTrade} accepts them.
 * @returns How many of each act.
 */
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

/**
 * How close to its deadline a request has to be for a person's card to call it
 * soon. Wider than the row badge's last-call window (`TradeExpiry`, 24h): the
 * card is a routing surface read at a glance, and it has to send you to the
 * person a day before the row itself starts shouting.
 */
const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

/**
 * How many of the rows waiting on the viewer run out within
 * {@link EXPIRING_SOON_MS}. Only requests can expire — a swap waiting to be
 * settled sits there as long as the two people do. Rows already past their
 * deadline count too: the server just has not swept them yet, and they are the
 * most urgent thing on the card until it does.
 * @param needsYou The rows waiting on the viewer.
 * @param now The moment the window is measured from.
 * @returns The count of requests expiring soon.
 */
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

/** @returns 0 for a request awaiting an answer, 1 for a swap awaiting a settle. */
function needsYouRank(trade: CardTradeResponse): number {
  return trade.actionNeeded === "accept-or-decline" ? 0 : 1;
}

/** @returns Negative when `a` expires first; a missing deadline sorts last. */
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

/**
 * Orders the rows waiting on the viewer. Requests lead, soonest to expire
 * first, because they are the only rows that run out on their own; the swaps to
 * settle follow, most recently touched first, since those wait as long as the
 * two people do.
 * @param trades The trades waiting on the viewer.
 * @returns The trades in that order.
 */
export function sortNeedsYou(trades: readonly CardTradeResponse[]): CardTradeResponse[] {
  return trades.toSorted((a, b) => {
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
  });
}

/** The member fields the hub sorts and keys on; the card carries the whole member through. */
export interface TradeHubMember {
  userId: string;
  userName: string | null;
}

/** The share fields the hub counts. */
interface TradeHubShare {
  userId: string;
  listIntent: "wish" | "trade" | "organize";
}

/** One person's card on the group's trades hub. */
export interface TradeHubCard<TMember> {
  member: TMember;
  /** This group's trades with them waiting on the viewer, in {@link sortNeedsYou} order. */
  needsYou: CardTradeResponse[];
  /** This group's other live trades with them: waiting on the other side. */
  open: CardTradeResponse[];
  /** Every trade with them in this group, live or finished. */
  trades: CardTradeResponse[];
  /** Distinct match suggestions with them in this group. */
  suggestions: number;
  /** Wishlists and tradelists they share with this group. */
  listCount: number;
  /** Trades with them this group has finished. */
  completedCount: number;
  /** Live trades with them in the viewer's *other* groups. */
  elsewhereCount: number;
}

/** Everything the hub's cards are derived from, all of it already on the page. */
export interface TradeHubCardsInput<TMember, TMatch> {
  viewerId: string;
  /** The group the hub belongs to, so the "in other groups" count can exclude it. */
  groupId: string;
  /** The group's roster, the viewer included (they get no card of their own). */
  members: readonly TMember[];
  /** The viewer's trades in this group. */
  groupTrades: readonly CardTradeResponse[];
  /** The viewer's trades across every group. */
  allTrades: readonly CardTradeResponse[];
  /** This group's match rows where the card comes to the viewer. */
  incoming: readonly TMatch[];
  /** This group's match rows where the card goes to the other member. */
  outgoing: readonly TMatch[];
  /** The lists shared with this group, by anyone. */
  shares: readonly TradeHubShare[];
}

/** @returns The member's sort name; a nameless member sorts last. */
function memberSortName(member: TradeHubMember): string {
  return member.userName ?? "\u{FFFF}";
}

/** @returns How high the card sorts; lower goes first, 4 is a quiet card. */
function cardRank(card: TradeHubCard<TradeHubMember>): number {
  if (card.needsYou.length > 0) {
    return 0;
  }
  if (card.open.length > 0) {
    return 1;
  }
  if (card.suggestions > 0) {
    return 2;
  }
  if (card.listCount > 0) {
    return 3;
  }
  return 4;
}

/**
 * Whether a card has nothing on it at all — no trades, no suggestions, not even
 * a shared list. Those members still get a card (they are who you'd start a
 * trade with next), but a dimmed one.
 * @param card The person's card.
 * @returns True when every count is zero.
 */
export function isQuietTradeHubCard(card: TradeHubCard<TradeHubMember>): boolean {
  return cardRank(card) === 4 && card.completedCount === 0 && card.elsewhereCount === 0;
}

/**
 * The group trades hub, as one card per member. Everything the old status
 * buckets split apart — the trades, the suggestions, the shared lists — is
 * gathered back under the person it is with, which is how a trade is actually
 * carried out.
 *
 * Suggestions are deduped the way the rest of the app does it: a suggestion with
 * a live trade for the same printing (in any shared group) is that trade now, so
 * it stops being a suggestion.
 * @param input The group's members, trades, matches and shares.
 * @returns One card per member other than the viewer, in reading order.
 */
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
  const tradesByPerson = Map.groupBy(input.groupTrades, (trade) => trade.counterparty.userId);
  const elsewhereByPerson = Map.groupBy(
    input.allTrades.filter(
      (trade) =>
        trade.groupId !== input.groupId &&
        (trade.status === "pending" || trade.status === "reserved"),
    ),
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
      return {
        member,
        // Not filtered to live first: a legacy completed row can still be
        // awaiting its settle, and that is exactly a row waiting on the viewer.
        needsYou: sortNeedsYou(trades.filter((trade) => isNeedsYouTrade(trade))),
        open: trades.filter(
          (trade) =>
            !isNeedsYouTrade(trade) && (trade.status === "pending" || trade.status === "reserved"),
        ),
        trades,
        suggestions: countTradeSuggestions(
          incomingByPerson.get(member.userId) ?? [],
          outgoingByPerson.get(member.userId) ?? [],
        ),
        listCount: (listsByPerson.get(member.userId) ?? []).length,
        completedCount: trades.filter((trade) => trade.status === "completed").length,
        elsewhereCount: (elsewhereByPerson.get(member.userId) ?? []).length,
      };
    });

  return cards.toSorted(
    (a, b) =>
      cardRank(a) - cardRank(b) || memberSortName(a.member).localeCompare(memberSortName(b.member)),
  );
}
