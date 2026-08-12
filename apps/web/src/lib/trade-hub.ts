import type { CardTradeResponse } from "@openrift/shared";
import { cardTradeState, isTradedCardTrade, needsViewerAction } from "@openrift/shared";

import type { MatchSuggestionFields } from "./trade-derivation";
import { tradeSuggestionKeys, withoutLiveTradeMatches } from "./trade-derivation";

/**
 * Whether a trade is still going: someone has an act left to perform. A
 * reservation the viewer has settled is not — only the other party's
 * confirmation is outstanding, and nothing about it is theirs to chase.
 * @param trade The trade to test.
 * @returns True while the trade is in flight.
 */
function isInFlightTrade(trade: CardTradeResponse): boolean {
  const state = cardTradeState(trade);
  return state === "to-answer" || state === "to-settle" || state === "waiting-on-them";
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
 * @param needsYou The rows waiting on the viewer, as `needsViewerAction` accepts them.
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
  /**
   * This group's other live trades with them: genuinely waiting on the other
   * side. A reservation the viewer has already settled is *not* in here — their
   * half is final, so the sheet files it under history, and a card that counted
   * it said "16 waiting on them" about a person the sheet called settled up.
   */
  open: CardTradeResponse[];
  /** Every trade with them in this group, live or finished. */
  trades: CardTradeResponse[];
  /** Distinct match suggestions with them in this group. */
  suggestions: number;
  /**
   * Suggestions with them the viewer's *other* groups add on top of this
   * group's. A card both groups can trade counts once, in `suggestions`, since
   * it is one opportunity however many groups reach it.
   */
  suggestionsElsewhere: number;
  /** Wishlists and tradelists they share with this group. */
  listCount: number;
  /** Trades with them in this group whose cards changed hands (`isTradedCardTrade`). */
  tradedCount: number;
  /** Trades with them still in flight in the viewer's *other* groups. */
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
  /**
   * The same two directions from every *other* group the viewer is in, pooled.
   * The trade sheet a card opens is person-level, so a member whose only
   * suggestions sit in another shared group has to be able to say so; a card
   * that stayed silent about them was the reason the hub and the sheet
   * disagreed. Empty while those groups' matches are still loading, which
   * simply means the hint appears a moment later.
   */
  elsewhereIncoming: readonly TMatch[];
  /** See {@link elsewhereIncoming}. */
  elsewhereOutgoing: readonly TMatch[];
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
  // Suggestions in another shared group rank with this group's: both are the
  // same opportunity from the same person, and the sheet the card opens shows
  // them side by side.
  if (card.suggestions > 0 || card.suggestionsElsewhere > 0) {
    return 2;
  }
  if (card.listCount > 0) {
    return 3;
  }
  return 4;
}

/** @returns "N possible trades", pluralized. */
function possibleTrades(count: number): string {
  return `${count} possible ${count === 1 ? "trade" : "trades"}`;
}

/**
 * The card's suggestions line: what the matcher found with this person, and how
 * much of it this group is not where it happens. The elsewhere part is named
 * rather than folded into one total, because the card sits on one group's page
 * while the sheet it opens pools them all — a member with nothing here and two
 * suggestions in another group has to read as exactly that, not as either "2
 * possible trades" (wrong page) or nothing at all (the old silence, which is
 * what sent people looking for a bug).
 * @param card The person's card.
 * @returns The line, or null when the matcher found nothing with them anywhere.
 */
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

/**
 * Whether a card has nothing on it at all — no trades, no suggestions, not even
 * a shared list. Those members still get a card (they are who you'd start a
 * trade with next), but a dimmed one.
 * @param card The person's card.
 * @returns True when every count is zero.
 */
export function isQuietTradeHubCard(card: TradeHubCard<TradeHubMember>): boolean {
  return cardRank(card) === 4 && card.tradedCount === 0 && card.elsewhereCount === 0;
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
        // Not filtered to live first: a legacy completed row can still be
        // awaiting its settle, and that is exactly a row waiting on the viewer.
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
