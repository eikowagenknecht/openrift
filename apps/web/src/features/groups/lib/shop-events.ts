import { formatDayLocal, formatWeekdayLocal } from "@openrift/shared/format-date";
import type { FriendGroupShopEventResponse } from "@openrift/shared/types/api/friend-group";

export type ShopEventRange = "upcoming" | "past" | "all";

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
  const weekday = formatWeekdayLocal(localMidnight(day));
  if (day === formatDayLocal(now)) {
    return `Today · ${weekday}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return day === formatDayLocal(tomorrow) ? `Tomorrow · ${weekday}` : weekday;
}

/**
 * Buckets by the viewer's own day: a Friday-night event is under Friday for
 * the player who drives there, whatever UTC calls it.
 */
export function groupShopEventsByDay(
  events: FriendGroupShopEventResponse[],
  now: Date = new Date(),
  order: "asc" | "desc" = "asc",
): ShopEventDay[] {
  const byDay = Map.groupBy(events, (event) => formatDayLocal(event.startAt));
  return [...byDay.entries()]
    .toSorted(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
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

/**
 * An event running today counts as current all day: the feed carries no end
 * time, so a start that has passed says nothing about whether it is over.
 */
export function filterShopEventsByRange(
  events: FriendGroupShopEventResponse[],
  range: ShopEventRange,
  now: Date = new Date(),
): FriendGroupShopEventResponse[] {
  if (range === "all") {
    return events;
  }
  const today = formatDayLocal(now);
  return events.filter((event) => {
    const day = formatDayLocal(event.startAt);
    return range === "past" ? day < today : day >= today;
  });
}
