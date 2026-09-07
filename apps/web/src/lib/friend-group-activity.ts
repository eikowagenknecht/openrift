import type { FriendGroupActivityEvent } from "@openrift/shared";
import { TRADE_VOLUME_WINDOW_DAYS } from "@openrift/shared/contracts/friend-groups";

export function tradeVolumeLabel(recent: number, lifetime: number): string {
  if (recent > 0) {
    return `${recent} ${recent === 1 ? "card" : "cards"} traded in the last ${TRADE_VOLUME_WINDOW_DAYS} days`;
  }
  return lifetime > 0
    ? `No trades in the last ${TRADE_VOLUME_WINDOW_DAYS} days`
    : "No trades here yet";
}

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

/** `at` is the day's newest timestamp: the input is newest-first. */
export interface ActivityDayGroup {
  key: string;
  at: string;
  rows: AggregatedActivityRow[];
}

function localDayKey(at: string): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function groupActivityRowsByDay(rows: AggregatedActivityRow[]): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  for (const row of rows) {
    const key = localDayKey(row.at);
    const last = groups.at(-1);
    if (last?.key === key) {
      last.rows.push(row);
    } else {
      groups.push({ key, at: row.at, rows: [row] });
    }
  }
  return groups;
}

export function distinctPrintingIds(events: readonly { printingId: string }[]): string[] {
  return [...new Set(events.map((event) => event.printingId))];
}

function sameParties(a: TradeCompletedEvent, b: TradeCompletedEvent): boolean {
  return a.giverUserId === b.giverUserId && a.receiverUserId === b.receiverUserId;
}

/** Only consecutive trade-completed events with the same parties merge into a {@link TradeBatch}. */
export function aggregateActivityEvents(
  events: FriendGroupActivityEvent[],
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
