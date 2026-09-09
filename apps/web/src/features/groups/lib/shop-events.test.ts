import type { FriendGroupShopEventResponse } from "@openrift/shared/types/api/friend-group";
import { describe, expect, it } from "vitest";

import {
  filterShopEvents,
  filterShopEventsByRange,
  groupShopEventsByDay,
  shopEventDayLabel,
} from "@/features/groups/lib/shop-events";

function event(overrides: Partial<FriendGroupShopEventResponse>): FriendGroupShopEventResponse {
  return {
    externalId: "1",
    name: "Nexus Night",
    startAt: "2026-09-11T17:00:00.000Z",
    storeId: 1,
    storeName: "FUNtainment Berlin",
    eventFormat: "Constructed",
    url: "https://locator.riftbound.uvsgames.com/events/1",
    ...overrides,
  };
}

describe("groupShopEventsByDay", () => {
  it("buckets by the viewer's local day, oldest first", () => {
    const days = groupShopEventsByDay([
      event({ externalId: "b", startAt: "2026-09-12T15:30:00.000Z" }),
      event({ externalId: "a", startAt: "2026-09-11T17:00:00.000Z" }),
    ]);

    expect(days.map((day) => day.day)).toEqual(["2026-09-11", "2026-09-12"]);
    expect(days[0]?.events).toHaveLength(1);
  });

  it("sorts events inside a day by start time", () => {
    const days = groupShopEventsByDay([
      event({ externalId: "late", startAt: "2026-09-11T17:00:00.000Z" }),
      event({ externalId: "early", startAt: "2026-09-11T09:00:00.000Z" }),
    ]);

    expect(days[0]?.events.map((entry) => entry.externalId)).toEqual(["early", "late"]);
  });

  it("puts the newest day first in descending order", () => {
    const days = groupShopEventsByDay(
      [
        event({ externalId: "b", startAt: "2026-09-12T15:30:00.000Z" }),
        event({ externalId: "a", startAt: "2026-09-11T17:00:00.000Z" }),
      ],
      new Date("2026-09-13T12:00:00.000Z"),
      "desc",
    );

    expect(days.map((day) => day.day)).toEqual(["2026-09-12", "2026-09-11"]);
  });

  it("returns nothing for no events", () => {
    expect(groupShopEventsByDay([])).toEqual([]);
  });
});

describe("shopEventDayLabel", () => {
  const now = new Date("2026-09-11T12:00:00.000Z");

  it("names today and tomorrow", () => {
    expect(shopEventDayLabel("2026-09-11", now)).toBe("Today · Friday");
    expect(shopEventDayLabel("2026-09-12", now)).toBe("Tomorrow · Saturday");
  });

  it("names any other day by its weekday", () => {
    expect(shopEventDayLabel("2026-09-14", now)).toBe("Monday");
  });

  it("rolls the month over when tomorrow is the first", () => {
    expect(shopEventDayLabel("2026-10-01", new Date("2026-09-30T12:00:00.000Z"))).toBe(
      "Tomorrow · Thursday",
    );
  });
});

describe("filterShopEventsByRange", () => {
  const now = new Date("2026-09-11T20:00:00.000Z");
  const events = [
    event({ externalId: "past", startAt: "2026-09-04T17:00:00.000Z" }),
    event({ externalId: "earlier-today", startAt: "2026-09-11T09:00:00.000Z" }),
    event({ externalId: "ahead", startAt: "2026-09-18T17:00:00.000Z" }),
  ];

  it("counts an event that already started today as current", () => {
    expect(
      filterShopEventsByRange(events, "upcoming", now).map((entry) => entry.externalId),
    ).toEqual(["earlier-today", "ahead"]);
  });

  it("keeps only days before today for past", () => {
    expect(filterShopEventsByRange(events, "past", now).map((entry) => entry.externalId)).toEqual([
      "past",
    ]);
  });

  it("keeps everything for all", () => {
    expect(filterShopEventsByRange(events, "all", now)).toHaveLength(3);
  });
});

describe("filterShopEvents", () => {
  const events = [event({ externalId: "a", storeId: 1 }), event({ externalId: "b", storeId: 2 })];

  it("keeps every event without a shop filter", () => {
    expect(filterShopEvents(events, null)).toHaveLength(2);
  });

  it("keeps only the chosen shop", () => {
    expect(filterShopEvents(events, 2).map((entry) => entry.externalId)).toEqual(["b"]);
  });
});
