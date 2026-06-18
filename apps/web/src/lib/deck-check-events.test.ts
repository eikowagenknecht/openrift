import type { DeckCheckEventSummaryResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { isPastOrArchivedEvent, partitionDeckCheckEvents } from "./deck-check-events";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function makeEvent(
  overrides: Partial<DeckCheckEventSummaryResponse> = {},
): DeckCheckEventSummaryResponse {
  return {
    id: "event-1",
    name: "Summoner Skirmish",
    eventDate: null,
    format: null,
    allowedSets: null,
    status: "active",
    entryCount: 0,
    checkedCount: 0,
    listLockMode: "on_submit",
    allowSelfSubmission: false,
    submissionToken: null,
    submissionsCloseAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isPastOrArchivedEvent", () => {
  it("treats an undated active event as current", () => {
    expect(isPastOrArchivedEvent(makeEvent({ eventDate: null }), NOW)).toBe(false);
  });

  it("treats an active event dated today as current", () => {
    expect(isPastOrArchivedEvent(makeEvent({ eventDate: "2026-06-18" }), NOW)).toBe(false);
  });

  it("treats an active event dated in the future as current", () => {
    expect(isPastOrArchivedEvent(makeEvent({ eventDate: "2026-06-19" }), NOW)).toBe(false);
  });

  it("treats an active event dated in the past as past", () => {
    expect(isPastOrArchivedEvent(makeEvent({ eventDate: "2026-06-17" }), NOW)).toBe(true);
  });

  it("treats an archived event as past regardless of its date", () => {
    expect(
      isPastOrArchivedEvent(makeEvent({ status: "archived", eventDate: "2026-12-31" }), NOW),
    ).toBe(true);
    expect(isPastOrArchivedEvent(makeEvent({ status: "archived", eventDate: null }), NOW)).toBe(
      true,
    );
  });
});

describe("partitionDeckCheckEvents", () => {
  it("splits events into current and past-or-archived, preserving order", () => {
    const upcoming = makeEvent({ id: "upcoming", eventDate: "2026-06-20" });
    const undated = makeEvent({ id: "undated", eventDate: null });
    const past = makeEvent({ id: "past", eventDate: "2026-05-01" });
    const archived = makeEvent({ id: "archived", status: "archived" });

    const { current, pastOrArchived } = partitionDeckCheckEvents(
      [upcoming, past, undated, archived],
      NOW,
    );

    expect(current.map((event) => event.id)).toEqual(["upcoming", "undated"]);
    expect(pastOrArchived.map((event) => event.id)).toEqual(["past", "archived"]);
  });

  it("returns two empty lists for no events", () => {
    expect(partitionDeckCheckEvents([], NOW)).toEqual({ current: [], pastOrArchived: [] });
  });
});
