import type { MetaEventSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  filterMetaEvents,
  metaEventCountries,
  nextEventSort,
  sortMetaEvents,
} from "./meta-events-index";
import type { MetaEra } from "./meta-scope";
import { ERA_CUSTOM } from "./meta-scope";

const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-06-01", to: null },
  { id: "origins", label: "Origins", from: "2025-10-31", to: "2026-05-31" },
];

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "e1",
    slug: "summoner-skirmish-vienna",
    name: "Summoner Skirmish at Cardhouse Vienna",
    eventDate: "2026-08-29",
    format: "constructed",
    tier: "store",
    country: "AT",
    location: "Vienna",
    playerCount: 18,
    organizer: "Cardhouse",
    playerRowCount: 18,
    deckCount: 4,
    winners: [],
    ...overrides,
  };
}

describe("metaEventCountries", () => {
  it("offers each country once, alphabetically, in upper case", () => {
    const countries = metaEventCountries([
      event({ country: "de" }),
      event({ country: "AT" }),
      event({ country: "DE" }),
    ]);
    expect(countries).toEqual(["AT", "DE"]);
  });

  it("offers nothing for events no source gave a country", () => {
    expect(metaEventCountries([event({ country: null }), event({ country: "??" })])).toEqual([]);
  });

  it("offers nothing for an empty archive", () => {
    expect(metaEventCountries([])).toEqual([]);
  });
});

describe("filterMetaEvents", () => {
  const events = [
    event({ id: "a", name: "Regional Qualifier Barcelona", country: "ES", tier: "premier" }),
    event({ id: "b", name: "City Challenge Cologne", country: "DE", tier: "competitive" }),
    event({ id: "c", name: "Nexus Night", organizer: "Mana Vortex", location: "Rotterdam" }),
  ];
  const all = { scope: {}, eras: ERAS };

  it("keeps everything when nothing narrows it", () => {
    expect(filterMetaEvents(events, all)).toHaveLength(3);
  });

  it("matches the search against name, organizer and venue alike", () => {
    expect(filterMetaEvents(events, { ...all, query: "barcelona" }).map((e) => e.id)).toEqual([
      "a",
    ]);
    expect(filterMetaEvents(events, { ...all, query: "mana vortex" }).map((e) => e.id)).toEqual([
      "c",
    ]);
    expect(filterMetaEvents(events, { ...all, query: "Rotterdam" }).map((e) => e.id)).toEqual([
      "c",
    ]);
  });

  it("ignores surrounding whitespace and an empty search", () => {
    expect(filterMetaEvents(events, { ...all, query: "  " })).toHaveLength(3);
    expect(filterMetaEvents(events, { ...all, query: "  cologne " }).map((e) => e.id)).toEqual([
      "b",
    ]);
  });

  it("narrows by tier and by country, whatever case the URL carries", () => {
    expect(
      filterMetaEvents(events, { ...all, scope: { tiers: ["premier"] } }).map((e) => e.id),
    ).toEqual(["a"]);
    expect(
      filterMetaEvents(events, { ...all, scope: { countries: ["de"] } }).map((e) => e.id),
    ).toEqual(["b"]);
  });

  it("narrows to the events the archive already holds something for", () => {
    const holdings = [
      event({ id: "listed", playerRowCount: 18, deckCount: 4 }),
      event({ id: "standings-only", playerRowCount: 18, deckCount: 0 }),
      event({ id: "pending", playerRowCount: 0, deckCount: 0 }),
    ];
    expect(filterMetaEvents(holdings, { ...all, holds: "decks" }).map((e) => e.id)).toEqual([
      "listed",
    ]);
    expect(filterMetaEvents(holdings, { ...all, holds: "standings" }).map((e) => e.id)).toEqual([
      "listed",
      "standings-only",
    ]);
    expect(filterMetaEvents(holdings, all)).toHaveLength(3);
  });

  it("narrows by format", () => {
    const mixed = [event({ id: "a" }), event({ id: "b", format: "limited" })];
    expect(
      filterMetaEvents(mixed, { ...all, scope: { formats: ["limited"] } }).map((e) => e.id),
    ).toEqual(["b"]);
  });

  it("narrows to an era's own window", () => {
    const spread = [
      event({ id: "old", eventDate: "2026-02-01" }),
      event({ id: "new", eventDate: "2026-08-29" }),
    ];
    expect(
      filterMetaEvents(spread, { ...all, scope: { era: "origins" } }).map((e) => e.id),
    ).toEqual(["old"]);
  });

  it("narrows to a custom range, inclusive at both ends", () => {
    const spread = [
      event({ id: "before", eventDate: "2026-07-31" }),
      event({ id: "first", eventDate: "2026-08-01" }),
      event({ id: "last", eventDate: "2026-08-31" }),
      event({ id: "after", eventDate: "2026-09-01" }),
    ];
    const scope = { era: ERA_CUSTOM, from: "2026-08-01", to: "2026-08-31" };
    expect(filterMetaEvents(spread, { ...all, scope }).map((e) => e.id)).toEqual(["first", "last"]);
  });

  it("keeps nothing when the search matches nothing", () => {
    expect(filterMetaEvents(events, { ...all, query: "Piltover" })).toEqual([]);
  });

  it("keeps nothing from an empty archive", () => {
    expect(filterMetaEvents([], { ...all, query: "anything" })).toEqual([]);
  });
});

describe("sortMetaEvents", () => {
  const events = [
    event({ id: "mid", name: "Beta", eventDate: "2026-05-01", playerRowCount: 50, deckCount: 5 }),
    event({ id: "new", name: "Alpha", eventDate: "2026-08-01", playerRowCount: 10, deckCount: 1 }),
    event({ id: "old", name: "Gamma", eventDate: "2026-01-01", playerRowCount: 90, deckCount: 9 }),
  ];

  it("orders newest first by default", () => {
    expect(sortMetaEvents(events).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("reverses on the ascending direction", () => {
    expect(sortMetaEvents(events, "date", "asc").map((e) => e.id)).toEqual(["old", "mid", "new"]);
  });

  it("orders by name, players and decks", () => {
    expect(sortMetaEvents(events, "name", "asc").map((e) => e.id)).toEqual(["new", "mid", "old"]);
    expect(sortMetaEvents(events, "players", "desc").map((e) => e.id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
    expect(sortMetaEvents(events, "decks", "asc").map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("puts the tiers that count for most first when ascending", () => {
    const tiers = [
      event({ id: "casual", name: "A", tier: "casual" }),
      event({ id: "premier", name: "B", tier: "premier" }),
      event({ id: "store", name: "C", tier: "store" }),
      event({ id: "competitive", name: "D", tier: "competitive" }),
    ];
    expect(sortMetaEvents(tiers, "tier", "asc").map((e) => e.id)).toEqual([
      "premier",
      "competitive",
      "store",
      "casual",
    ]);
  });

  it("leaves an unrecorded country last in both directions", () => {
    const countries = [
      event({ id: "none", name: "A", country: null }),
      event({ id: "es", name: "B", country: "ES" }),
      event({ id: "at", name: "C", country: "AT" }),
    ];
    expect(sortMetaEvents(countries, "country", "asc").map((e) => e.id)).toEqual([
      "at",
      "es",
      "none",
    ]);
    expect(sortMetaEvents(countries, "country", "desc").map((e) => e.id)).toEqual([
      "es",
      "at",
      "none",
    ]);
  });

  it("breaks ties on the event name so the order never reshuffles", () => {
    const sameDay = [
      event({ id: "z", name: "Zaun Open", eventDate: "2026-08-01" }),
      event({ id: "p", name: "Piltover Open", eventDate: "2026-08-01" }),
    ];
    expect(sortMetaEvents(sameDay, "date", "desc").map((e) => e.id)).toEqual(["p", "z"]);
  });

  it("leaves the caller's array untouched", () => {
    const original = [...events];
    sortMetaEvents(events, "name", "asc");
    expect(events).toEqual(original);
  });

  it("sorts an empty archive to an empty list", () => {
    expect(sortMetaEvents([], "players", "asc")).toEqual([]);
  });
});

describe("nextEventSort", () => {
  it("flips the direction when the same column is clicked again", () => {
    expect(nextEventSort({ sort: "date", direction: "desc" }, "date")).toEqual({
      sort: "date",
      direction: "asc",
    });
    expect(nextEventSort({ sort: "date", direction: "asc" }, "date")).toEqual({
      sort: "date",
      direction: "desc",
    });
  });

  it("starts a count column at its biggest values", () => {
    expect(nextEventSort({ sort: "date", direction: "desc" }, "players")).toEqual({
      sort: "players",
      direction: "desc",
    });
  });

  it("starts a name or tier column at the top of its scale", () => {
    expect(nextEventSort({ sort: "date", direction: "desc" }, "name")).toEqual({
      sort: "name",
      direction: "asc",
    });
    expect(nextEventSort({ sort: "date", direction: "desc" }, "tier")).toEqual({
      sort: "tier",
      direction: "asc",
    });
  });
});
