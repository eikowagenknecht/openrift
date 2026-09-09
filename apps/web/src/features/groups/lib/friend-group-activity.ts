import { TRADE_VOLUME_WINDOW_DAYS } from "@openrift/shared/contracts/friend-groups";
import type { AggregatedActivityRow } from "@openrift/shared/friend-group-activity";
import { aggregateActivityEvents } from "@openrift/shared/friend-group-activity";
import type { FriendGroupActivityEvent } from "@openrift/shared/types/api/friend-group";

export function tradeVolumeLabel(recent: number, lifetime: number): string {
  if (recent > 0) {
    return `${recent} ${recent === 1 ? "card" : "cards"} traded in the last ${TRADE_VOLUME_WINDOW_DAYS} days`;
  }
  return lifetime > 0
    ? `No trades in the last ${TRADE_VOLUME_WINDOW_DAYS} days`
    : "No trades here yet";
}

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

/** Aggregates within a local day, so a trade batch never spans two date leaves. */
export function buildActivityDays(
  events: readonly FriendGroupActivityEvent[],
  maxRows: number,
): ActivityDayGroup[] {
  const days: ActivityDayGroup[] = [];
  let budget = maxRows;
  for (const [key, dayEvents] of Map.groupBy(events, (event) => localDayKey(event.at))) {
    if (budget <= 0) {
      break;
    }
    const rows = aggregateActivityEvents(dayEvents).slice(0, budget);
    const first = rows[0];
    if (first === undefined) {
      continue;
    }
    budget -= rows.length;
    days.push({ key, at: first.at, rows });
  }
  return days;
}

export function distinctPrintingIds(events: readonly { printingId: string }[]): string[] {
  return [...new Set(events.map((event) => event.printingId))];
}
