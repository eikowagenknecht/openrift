import type { DeckCheckEventSummaryResponse } from "@openrift/shared";

/**
 * An event is "current" when it is active and either undated or dated today or
 * later. Everything else — active events whose date has passed, and archived
 * events regardless of date — is "past or archived".
 * @param event The event summary to classify.
 * @param now Reference instant for "today" (defaults to the current time).
 * @returns True when the event is past or archived.
 */
export function isPastOrArchivedEvent(
  event: DeckCheckEventSummaryResponse,
  now: Date = new Date(),
): boolean {
  if (event.status === "archived") {
    return true;
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return event.eventDate !== null && new Date(event.eventDate).getTime() < startOfToday.getTime();
}

/**
 * Splits events into current (upcoming or undated active) and past-or-archived,
 * preserving the input order within each group.
 * @param events The events to partition.
 * @param now Reference instant for "today" (defaults to the current time).
 * @returns The `current` and `pastOrArchived` event lists.
 */
export function partitionDeckCheckEvents(
  events: readonly DeckCheckEventSummaryResponse[],
  now: Date = new Date(),
): {
  current: DeckCheckEventSummaryResponse[];
  pastOrArchived: DeckCheckEventSummaryResponse[];
} {
  const current: DeckCheckEventSummaryResponse[] = [];
  const pastOrArchived: DeckCheckEventSummaryResponse[] = [];
  for (const event of events) {
    if (isPastOrArchivedEvent(event, now)) {
      pastOrArchived.push(event);
    } else {
      current.push(event);
    }
  }
  return { current, pastOrArchived };
}
