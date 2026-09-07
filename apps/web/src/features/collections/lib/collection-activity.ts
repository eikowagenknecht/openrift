import type { CollectionEventResponse } from "@openrift/shared/types/api/collection-event";
import type { ActivityAction } from "@openrift/shared/types/enums";

export type ActionFilter = ActivityAction | "all";
export type DatePreset = "all" | "today" | "week" | "month";

export interface GroupedEvent {
  event: CollectionEventResponse;
  count: number;
}

export function getDateCutoff(preset: DatePreset): Date | null {
  if (preset === "all") {
    return null;
  }
  const now = new Date();
  if (preset === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (preset === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
}

export function groupEvents(events: CollectionEventResponse[]): GroupedEvent[] {
  const groups = new Map<string, GroupedEvent>();
  for (const event of events) {
    const collectionId = event.toCollectionId ?? event.fromCollectionId ?? "";
    const key = `${event.action}:${event.printingId}:${collectionId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
    } else {
      groups.set(key, { event, count: 1 });
    }
  }
  return [...groups.values()];
}
