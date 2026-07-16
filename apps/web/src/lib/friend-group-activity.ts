import type { FriendGroupActivityEvent } from "@openrift/shared";

/** The trade-completed member of the activity union. */
type TradeCompletedEvent = Extract<FriendGroupActivityEvent, { kind: "trade-completed" }>;

/**
 * A run of consecutive completed trades between the same giver and receiver,
 * collapsed into one feed row ("X traded N cards to Y" with a thumb stack).
 * `at` is the newest event's timestamp (the feed is newest-first, so it is
 * also the run's position in the feed). `events` keep the feed order.
 */
export interface TradeBatch {
  kind: "trade-batch";
  at: string;
  giverUserId: string;
  giverName: string | null;
  receiverUserId: string;
  receiverName: string | null;
  /** Sum of the per-trade quantities — the "N cards" of the row text. */
  totalQuantity: number;
  events: TradeCompletedEvent[];
}

/** One feed row after aggregation: a lone event, or a collapsed trade run. */
export type AggregatedActivityRow =
  | { kind: "event"; at: string; event: FriendGroupActivityEvent }
  | TradeBatch;

function sameParties(a: TradeCompletedEvent, b: TradeCompletedEvent): boolean {
  return a.giverUserId === b.giverUserId && a.receiverUserId === b.receiverUserId;
}

/**
 * Collapses runs of consecutive trade-completed events with the same giver and
 * receiver into single {@link TradeBatch} rows, leaving everything else (and
 * lone trades) as plain event rows. A trading session between two members
 * lands in the feed as one event per card, which otherwise renders as a wall
 * of near-identical rows; only *consecutive* events merge, so interleaved
 * activity keeps its chronology.
 * @returns The feed rows, newest-first like the input.
 */
export function aggregateActivityEvents(
  events: FriendGroupActivityEvent[],
): AggregatedActivityRow[] {
  const rows: AggregatedActivityRow[] = [];
  let run: TradeCompletedEvent[] = [];

  const flush = () => {
    if (run.length === 0) {
      return;
    }
    if (run.length === 1) {
      rows.push({ kind: "event", at: run[0].at, event: run[0] });
    } else {
      const first = run[0];
      rows.push({
        kind: "trade-batch",
        at: first.at,
        giverUserId: first.giverUserId,
        giverName: first.giverName,
        receiverUserId: first.receiverUserId,
        receiverName: first.receiverName,
        totalQuantity: run.reduce((sum, event) => sum + event.quantity, 0),
        events: run,
      });
    }
    run = [];
  };

  for (const event of events) {
    if (event.kind !== "trade-completed") {
      flush();
      rows.push({ kind: "event", at: event.at, event });
      continue;
    }
    if (run.length > 0 && !sameParties(run[0], event)) {
      flush();
    }
    run.push(event);
  }
  flush();
  return rows;
}
