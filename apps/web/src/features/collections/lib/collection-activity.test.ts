import type { CollectionEventResponse } from "@openrift/shared/types/api/collection-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDateCutoff, groupEvents } from "./collection-activity";

function event(overrides: Partial<CollectionEventResponse> = {}): CollectionEventResponse {
  return {
    id: "e1",
    action: "added",
    copyId: "copy-1",
    printingId: "p1",
    fromCollectionId: null,
    fromCollectionName: null,
    toCollectionId: "c1",
    toCollectionName: "Main",
    createdAt: "2026-01-01T00:00:00.000Z",
    shortCode: "OGN-001",
    rarity: "common",
    imageId: null,
    cardName: "Card",
    cardTypes: ["unit"],
    cardSuperTypes: [],
    tags: [],
    ...overrides,
  };
}

describe("getDateCutoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for the all-time preset", () => {
    expect(getDateCutoff("all")).toBeNull();
  });

  it("returns local midnight for today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 17, 13, 45, 30));
    const cutoff = getDateCutoff("today");
    expect(cutoff).toEqual(new Date(2026, 4, 17));
  });

  it("returns seven days back for the week preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 17, 13, 45, 30));
    expect(getDateCutoff("week")).toEqual(new Date(2026, 4, 10, 13, 45, 30));
  });

  it("returns thirty days back for the month preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 17, 13, 45, 30));
    expect(getDateCutoff("month")).toEqual(new Date(2026, 3, 17, 13, 45, 30));
  });
});

describe("groupEvents", () => {
  it("returns an empty list for no events", () => {
    expect(groupEvents([])).toEqual([]);
  });

  it("counts events sharing action, printing and collection", () => {
    const grouped = groupEvents([
      event({ id: "a" }),
      event({ id: "b" }),
      event({ id: "c", printingId: "p2" }),
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.count).toBe(2);
    expect(grouped[0]?.event.id).toBe("a");
    expect(grouped[1]?.count).toBe(1);
    expect(grouped[1]?.event.printingId).toBe("p2");
  });

  it("keeps different actions on the same printing apart", () => {
    const grouped = groupEvents([
      event({ id: "a", action: "added" }),
      event({ id: "b", action: "removed", toCollectionId: "c1" }),
    ]);
    expect(grouped.map((g) => g.event.action)).toEqual(["added", "removed"]);
  });

  it("falls back to the source collection when there is no target", () => {
    const grouped = groupEvents([
      event({ id: "a", action: "removed", toCollectionId: null, fromCollectionId: "c1" }),
      event({ id: "b", action: "removed", toCollectionId: null, fromCollectionId: "c2" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("groups events missing both collections together", () => {
    const grouped = groupEvents([
      event({ id: "a", toCollectionId: null, fromCollectionId: null }),
      event({ id: "b", toCollectionId: null, fromCollectionId: null }),
    ]);
    expect(grouped).toEqual([
      { event: expect.objectContaining({ id: "a" }) as CollectionEventResponse, count: 2 },
    ]);
  });
});
