import { formatDayLocal, formatWeekdayDayLocal } from "@openrift/shared/format-date";
import type { FriendGroupShopEventResponse } from "@openrift/shared/types/api/friend-group";

export interface ShopEventDay {
  day: string;
  label: string;
  events: FriendGroupShopEventResponse[];
}

// The bucket keys are local days, so they have to be read back as local
// midnight; `2026-09-11` alone parses as UTC and slides a day west of London.
function localMidnight(day: string): string {
  return `${day}T00:00:00`;
}

export function shopEventDayLabel(day: string, now: Date = new Date()): string {
  const label = formatWeekdayDayLocal(localMidnight(day));
  if (day === formatDayLocal(now)) {
    return `Today · ${label}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return day === formatDayLocal(tomorrow) ? `Tomorrow · ${label}` : label;
}

/**
 * Buckets by the viewer's own day: a Friday-night event is under Friday for
 * the player who drives there, whatever UTC calls it.
 */
export function groupShopEventsByDay(
  events: FriendGroupShopEventResponse[],
  now: Date = new Date(),
): ShopEventDay[] {
  const byDay = Map.groupBy(events, (event) => formatDayLocal(event.startAt));
  return [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, dayEvents]) => ({
      day,
      label: shopEventDayLabel(day, now),
      events: dayEvents.toSorted((a, b) => a.startAt.localeCompare(b.startAt)),
    }));
}

export function filterShopEvents(
  events: FriendGroupShopEventResponse[],
  storeId: number | null,
): FriendGroupShopEventResponse[] {
  return storeId === null ? events : events.filter((event) => event.storeId === storeId);
}
