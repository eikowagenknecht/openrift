import type { FriendGroupActivityEvent } from "@openrift/shared/types/api/friend-group";

type TradeCompletedEvent = Extract<FriendGroupActivityEvent, { kind: "trade-completed" }>;

export interface TradeBatch {
  kind: "trade-batch";
  at: string;
  giverUserId: string | null;
  giverName: string | null;
  receiverUserId: string | null;
  receiverName: string | null;
  totalQuantity: number;
  events: TradeCompletedEvent[];
}

export type AggregatedActivityRow =
  | { kind: "event"; at: string; event: FriendGroupActivityEvent }
  | TradeBatch;

function sameParties(a: TradeCompletedEvent, b: TradeCompletedEvent): boolean {
  return a.giverUserId === b.giverUserId && a.receiverUserId === b.receiverUserId;
}

/** Only consecutive trade-completed events with the same parties merge into a {@link TradeBatch}. */
export function aggregateActivityEvents(
  events: readonly FriendGroupActivityEvent[],
): AggregatedActivityRow[] {
  const rows: AggregatedActivityRow[] = [];
  let run: TradeCompletedEvent[] = [];

  const flush = () => {
    const first = run[0];
    if (first === undefined) {
      return;
    }
    if (run.length === 1) {
      rows.push({ kind: "event", at: first.at, event: first });
    } else {
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
    const head = run[0];
    if (head !== undefined && !sameParties(head, event)) {
      flush();
    }
    run.push(event);
  }
  flush();
  return rows;
}

/** Keeps every event of the newest `maxRows` aggregated rows, so one batch costs one row. */
export function limitEventsToRows(
  events: readonly FriendGroupActivityEvent[],
  maxRows: number,
): FriendGroupActivityEvent[] {
  return aggregateActivityEvents(events)
    .slice(0, maxRows)
    .flatMap((row) => (row.kind === "trade-batch" ? row.events : [row.event]));
}
