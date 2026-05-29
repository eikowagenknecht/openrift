import type { CardTradeResponse } from "@openrift/shared";

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
