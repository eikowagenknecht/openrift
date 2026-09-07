import type { CardTradeStatus } from "./types/api/card-trade.js";

const LIVE_CARD_TRADE_STATUSES = ["pending", "reserved"] as const;

/**
 * `reserved` counts as traded once {@link isTradedCardTrade} also confirms the
 * settle; don't test this list alone. `declined`/`cancelled`/`expired` stay
 * excluded so a bulk-cancelled half-settled trade isn't counted.
 */
export const TRADED_CARD_TRADE_STATUSES = ["reserved", "completed"] as const;

/**
 * Order matters (least to most committed): `cardTradeLivePhaseSchema` is
 * built from this tuple.
 */
export const CARD_TRADE_LIVE_PHASES = ["asked", "offered", "reserved"] as const;

export function cardTradeLivePhaseRank(phase: (typeof CARD_TRADE_LIVE_PHASES)[number]): number {
  return CARD_TRADE_LIVE_PHASES.indexOf(phase);
}

export function isLiveCardTradeStatus(status: CardTradeStatus): boolean {
  return (LIVE_CARD_TRADE_STATUSES as readonly string[]).includes(status);
}

export type CardTradeState = "to-answer" | "to-settle" | "waiting-on-them" | "done" | "closed";

export interface CardTradeStateFields {
  status: CardTradeStatus;
  actionNeeded: "accept-or-decline" | "cancel" | "settle" | null;
  viewerSyncAppliedAt: string | null;
}

/**
 * Action-led: `actionNeeded` from the server can put an otherwise
 * `completed`-looking row into `to-settle`.
 */
export function cardTradeState(trade: CardTradeStateFields): CardTradeState {
  if (trade.actionNeeded === "accept-or-decline") {
    return "to-answer";
  }
  if (trade.actionNeeded === "settle") {
    return "to-settle";
  }
  if (trade.status === "pending") {
    return "waiting-on-them";
  }
  if (trade.status === "reserved") {
    return trade.viewerSyncAppliedAt === null ? "waiting-on-them" : "done";
  }
  return trade.status === "completed" ? "done" : "closed";
}

export function needsViewerAction(trade: CardTradeStateFields): boolean {
  const state = cardTradeState(trade);
  return state === "to-answer" || state === "to-settle";
}

export function isTradedCardTrade(trade: CardTradeStateFields): boolean {
  return cardTradeState(trade) === "done";
}
