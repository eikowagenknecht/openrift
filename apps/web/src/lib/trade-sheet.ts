import type { CardTradeResponse } from "@openrift/shared";

import { isNeedsYouTrade, sortNeedsYou } from "./trade-hub";

/**
 * The distinct printings a list's rows cover, for the card detail's prev/next.
 * The detail is addressed by printing id, so a list naming one printing twice
 * has no second position to step to; a single position passes nothing, which
 * keeps the position label off a detail with nowhere to go.
 * @param trades The list's trades, in the order they are shown.
 * @returns The printing ids to step through, or undefined when there is nothing to step to.
 */
export function stepSequence(trades: readonly CardTradeResponse[]): string[] | undefined {
  const printingIds = [...new Set(trades.map((trade) => trade.printingId))];
  return printingIds.length > 1 ? printingIds : undefined;
}

/**
 * One counterparty's trades, arranged the way the trade sheet reads them: the
 * requests waiting on the viewer first, then the agreed swaps the two of them
 * work through together, then what waits on the other side, then the finished
 * pile. Position encodes urgency; each row's direction arrow encodes which way
 * its card moves.
 */
export interface TradeLedger {
  /** Requests waiting on the viewer's yes or no, soonest to expire first. */
  yourMove: CardTradeResponse[];
  /** Agreed swaps the viewer can still settle, most recently touched first. */
  readyToSwap: CardTradeResponse[];
  /** Other live trades: requests the viewer sent, waiting on the other side. */
  waiting: CardTradeResponse[];
  /**
   * Trades with nothing left for the viewer to do, newest first: the terminal
   * ones, plus the swaps whose viewer half is already settled.
   */
  history: CardTradeResponse[];
}

/**
 * How far up the waiting section a trade sorts: agreed swaps the other side
 * still has to confirm ahead of requests nobody has answered yet. Only reached
 * by data the server does not currently produce — a reserved row the viewer has
 * not settled always asks for a settle, so it sorts into `readyToSwap` — but the
 * tier keeps the section right if that ever changes.
 * @param trade The trade to rank.
 * @returns The sort tier; lower sorts first.
 */
function waitingRank(trade: CardTradeResponse): number {
  return trade.status === "reserved" ? 0 : 1;
}

/** @returns Negative when `a` is the more recently touched trade. */
function byUpdatedAtDescending(a: CardTradeResponse, b: CardTradeResponse): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Whether a trade the viewer has no action on is still theirs to watch. A
 * request they sent is: the other side may yet answer it. A swap they have
 * settled is not — their half is final and only the other party's confirmation
 * is outstanding (ADR-019, amendment 2026-08-10), so it reads as done from here.
 * @param trade The trade to test.
 * @returns True while the trade belongs in the waiting section.
 */
function stillWaiting(trade: CardTradeResponse): boolean {
  if (trade.status === "pending") {
    return true;
  }
  return trade.status === "reserved" && trade.viewerSyncAppliedAt === null;
}

/**
 * Splits the viewer's trades with one person into the trade sheet's four
 * sections. Action-based, not status-based: a legacy `completed` row still
 * awaiting the viewer's settle belongs in ready-to-swap (it is a pile in front
 * of them), not in history — which is also what keeps the sheet agreeing with
 * the people-first counts on the group surfaces.
 *
 * The same rule sends a swap the viewer has settled to history rather than to
 * the waiting section. Nothing about it is theirs to chase, so filing it beside
 * the requests they are still owed an answer to would put a finished errand in
 * front of them every visit.
 * @param trades The viewer's trades, from any set of groups.
 * @param counterpartyUserId The person the sheet is about.
 * @returns The your-move / ready-to-swap / waiting / history lists, each already sorted.
 */
export function splitTradeLedger(
  trades: readonly CardTradeResponse[],
  counterpartyUserId: string,
): TradeLedger {
  const mine = trades.filter((trade) => trade.counterparty.userId === counterpartyUserId);
  const rest = mine.filter((trade) => !isNeedsYouTrade(trade));
  return {
    yourMove: sortNeedsYou(mine.filter((trade) => trade.actionNeeded === "accept-or-decline")),
    readyToSwap: mine
      .filter((trade) => trade.actionNeeded === "settle")
      .toSorted(byUpdatedAtDescending),
    waiting: rest
      .filter((trade) => stillWaiting(trade))
      .toSorted((a, b) => waitingRank(a) - waitingRank(b) || byUpdatedAtDescending(a, b)),
    history: rest.filter((trade) => !stillWaiting(trade)).toSorted(byUpdatedAtDescending),
  };
}
