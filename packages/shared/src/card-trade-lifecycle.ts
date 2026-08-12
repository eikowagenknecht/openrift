import type { CardTradeStatus } from "./types/index.js";

/**
 * The one place a trade's lifecycle is interpreted. Every surface that counts
 * trades — the members page's per-member badge, the trades hub's cards, the
 * trade sheet's sections, the member detail line, the group hero's stat —
 * derives from what is here, so a number on one page cannot disagree with a
 * number on another. Each of those used to carry its own rule, and they did
 * disagree: a member with no finished trade showed "3 traded", and a person the
 * sheet called settled up showed 16 trades waiting on them.
 */

/** Trades still moving: someone can still act on them. */
const LIVE_CARD_TRADE_STATUSES = ["pending", "reserved"] as const;

/**
 * The statuses a row whose cards changed hands can be in.
 *
 * `completed` is the finished swap — the server sets it exactly when *both*
 * parties confirm (`markCompletedWhenBothSettled`). `reserved` is here because
 * a trade counts from the *first* settle, not from completion (ADR-019,
 * amendment 2026-08-10): waiting for both would permanently undercount every
 * swap whose second side never confirms, which is the common shape once cards
 * have physically changed hands at a table.
 *
 * Status alone is never enough — a `reserved` row also has to carry the settle
 * itself. That is what {@link isTradedCardTrade} adds, and why nothing should
 * test this list on its own.
 *
 * `declined`, `cancelled` and `expired` are absent, which is the point: the old
 * predicate tested only the sync timestamps, and `cancelForDepartingMember`
 * bulk-cancels a leaving member's live trades without clearing them, so a
 * half-settled row cancelled that way counted as traded forever.
 */
export const TRADED_CARD_TRADE_STATUSES = ["reserved", "completed"] as const;

/**
 * Whether a trade is still moving.
 * @param status The trade's status.
 * @returns True for `pending` and `reserved`.
 */
export function isLiveCardTradeStatus(status: CardTradeStatus): boolean {
  return (LIVE_CARD_TRADE_STATUSES as readonly string[]).includes(status);
}

/**
 * What a trade is asking of the viewer, or of the person across from them.
 *
 * - `to-answer` — a request awaiting the viewer's yes or no.
 * - `to-settle` — an agreed swap whose own half the viewer has not confirmed.
 * - `waiting-on-them` — live, with nothing left for the viewer to do but wait.
 * - `done` — over as far as the viewer is concerned: completed, or reserved
 *   with the viewer's own half settled. A viewer-settled half is final and only
 *   the other party's confirmation is outstanding (ADR-019, amendment
 *   2026-08-10), so it reads as done from here and is counted as traded.
 * - `closed` — declined, cancelled or expired: it never happened.
 */
export type CardTradeState = "to-answer" | "to-settle" | "waiting-on-them" | "done" | "closed";

/** The fields {@link cardTradeState} reads. Any viewer-oriented trade DTO satisfies it. */
export interface CardTradeStateFields {
  status: CardTradeStatus;
  actionNeeded: "accept-or-decline" | "cancel" | "settle" | null;
  viewerSyncAppliedAt: string | null;
}

/**
 * Classifies one trade from the viewer's side. Action-led rather than
 * status-led: the server has already worked out what the viewer owes on this
 * row, and a legacy `completed` row can still be awaiting a settle, which is a
 * pile in front of them however the status reads.
 * @param trade The trade, as any viewer-oriented DTO.
 * @returns Its state.
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
  // Reaching here on a reserved row means the viewer's half is settled — an
  // unsettled one always asks for a settle above. The timestamp is tested
  // anyway so the rule stays right if the server's `actionNeeded` ever changes.
  if (trade.status === "reserved") {
    return trade.viewerSyncAppliedAt === null ? "waiting-on-them" : "done";
  }
  return trade.status === "completed" ? "done" : "closed";
}

/**
 * Whether the trade is the viewer's move, either act of it.
 * @param trade The trade.
 * @returns True when the viewer is the one holding it up.
 */
export function needsViewerAction(trade: CardTradeStateFields): boolean {
  const state = cardTradeState(trade);
  return state === "to-answer" || state === "to-settle";
}

/**
 * Whether this trade's cards count as having changed hands with the viewer.
 * The client-side twin of the members page's per-member badge, so a count and
 * the sheet behind it are the same rule read twice.
 * @param trade The trade.
 * @returns True when the swap is done from the viewer's side.
 */
export function isTradedCardTrade(trade: CardTradeStateFields): boolean {
  return cardTradeState(trade) === "done";
}
