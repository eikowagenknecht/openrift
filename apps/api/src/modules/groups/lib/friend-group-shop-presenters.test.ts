import { describe, expect, it } from "vitest";

import {
  presentGroupShop,
  presentShopEvent,
  presentShopSearchResult,
} from "./friend-group-shop-presenters.js";

describe("presentGroupShop", () => {
  it("renders the next listing as an ISO instant", () => {
    expect(
      presentGroupShop({
        storeId: 42,
        name: "FUNtainment Berlin",
        location: "79-83 Frankfurter Allee, Berlin, 10247, DE",
        upcomingCount: 8,
        nextEventAt: new Date("2026-09-11T15:00:00Z"),
      }),
    ).toEqual({
      storeId: 42,
      name: "FUNtainment Berlin",
      location: "79-83 Frankfurter Allee, Berlin, 10247, DE",
      upcomingCount: 8,
      nextEventAt: "2026-09-11T15:00:00.000Z",
    });
  });

  it("keeps a shop with nothing listed", () => {
    const shop = presentGroupShop({
      storeId: 42,
      name: "Dice Heart",
      location: null,
      upcomingCount: 0,
      nextEventAt: null,
    });
    expect(shop.nextEventAt).toBeNull();
    expect(shop.location).toBeNull();
  });
});

describe("presentShopSearchResult", () => {
  const row = { storeId: 42, name: "Dice Heart", location: null, upcomingCount: 3 };

  it("marks a shop the group already follows", () => {
    expect(presentShopSearchResult(row, new Set([42])).linked).toBe(true);
  });

  it("leaves an unlinked shop selectable", () => {
    expect(presentShopSearchResult(row, new Set([43])).linked).toBe(false);
  });
});

describe("presentShopEvent", () => {
  it("cites the source listing", () => {
    expect(
      presentShopEvent({
        externalId: "9911",
        name: "Nexus Night",
        startAt: new Date("2026-09-11T15:00:00Z"),
        storeId: 42,
        storeName: "FUNtainment Berlin",
        eventFormat: "Constructed",
      }),
    ).toEqual({
      externalId: "9911",
      name: "Nexus Night",
      startAt: "2026-09-11T15:00:00.000Z",
      storeId: 42,
      storeName: "FUNtainment Berlin",
      eventFormat: "Constructed",
      url: "https://locator.riftbound.uvsgames.com/events/9911",
    });
  });
});
