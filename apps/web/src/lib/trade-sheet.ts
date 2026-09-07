import { cardTradeState, needsViewerAction } from "@openrift/shared/card-trade-lifecycle";
import type { CardTradeResponse } from "@openrift/shared/types/api/card-trade";

import { sortNeedsYou } from "./trade-hub";

export function stepSequence(trades: readonly CardTradeResponse[]): string[] | undefined {
  const printingIds = [...new Set(trades.map((trade) => trade.printingId))];
  return printingIds.length > 1 ? printingIds : undefined;
}

export interface TradeLedger {
  yourMove: CardTradeResponse[];
  readyToSwap: CardTradeResponse[];
  waiting: CardTradeResponse[];
  history: CardTradeResponse[];
}

// Currently unreachable: an unsettled reserved row always resolves to
// readyToSwap, not waiting. Kept in case the server ever produces one here.
function waitingRank(trade: CardTradeResponse): number {
  return trade.status === "reserved" ? 0 : 1;
}

function byUpdatedAtDescending(a: CardTradeResponse, b: CardTradeResponse): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export type PrintingRank = (printingId: string) => number;

const noPrintingRank: PrintingRank = () => 0;

function directionRank(trade: CardTradeResponse): number {
  return trade.role === "receiver" ? 0 : 1;
}

function byDirectionThenCatalog(
  printingRank: PrintingRank,
): (a: CardTradeResponse, b: CardTradeResponse) => number {
  return (a, b) =>
    directionRank(a) - directionRank(b) ||
    printingRank(a.printingId) - printingRank(b.printingId) ||
    byUpdatedAtDescending(a, b);
}

function stillWaiting(trade: CardTradeResponse): boolean {
  return cardTradeState(trade) === "waiting-on-them";
}

export function splitTradeLedger(
  trades: readonly CardTradeResponse[],
  counterpartyUserId: string,
  printingRank: PrintingRank = noPrintingRank,
): TradeLedger {
  const mine = trades.filter((trade) => trade.counterparty.userId === counterpartyUserId);
  const rest = mine.filter((trade) => !needsViewerAction(trade));
  const byPile = byDirectionThenCatalog(printingRank);
  return {
    yourMove: sortNeedsYou(mine.filter((trade) => trade.actionNeeded === "accept-or-decline")),
    readyToSwap: mine.filter((trade) => trade.actionNeeded === "settle").toSorted(byPile),
    waiting: rest
      .filter((trade) => stillWaiting(trade))
      .toSorted((a, b) => waitingRank(a) - waitingRank(b) || byPile(a, b)),
    history: rest.filter((trade) => !stillWaiting(trade)).toSorted(byUpdatedAtDescending),
  };
}
