import type { MetaDeckSummary, MetaEventSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  filterMetaEvents,
  latestMetaWinners,
  metaDecksForEvents,
  metaEventCountries,
  metaTiersByEventSlug,
} from "@/lib/meta-front-page";
import type { MetaEra } from "@/lib/meta-scope";
import { ERA_ALL, ERA_CUSTOM } from "@/lib/meta-scope";

const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
];

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "evt-1",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    tier: "store",
    country: "DE",
    location: "Rift Games, Berlin",
    playerCount: 32,
    organizer: "Rift Games Berlin",
    playerRowCount: 32,
    deckCount: 4,
    winners: [],
    ...overrides,
  };
}

function deck(overrides: Partial<MetaDeckSummary> = {}): MetaDeckSummary {
  return {
    playerId: "player-1",
    deckId: "deck-1",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    name: "Kennen Tempo",
    format: "standard",
    legendCardId: "legend-1",
    legendName: "Kennen, Heart of the Tempest",
    legendSlug: "kennen",
    legendImageId: "img-1",
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "Nova",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-15",
      format: "standard",
    },
    ...overrides,
  };
}

const WINNER = {
  playerName: "Nova",
  wins: 6,
  losses: 1,
  draws: 0,
  legend: {
    cardId: "legend-1",
    name: "Kennen, Heart of the Tempest",
    slug: "kennen",
    imageId: null,
    domains: ["chaos", "order"],
  },
};

const CO_WINNER = { ...WINNER, playerName: "Ekko" };

describe("filterMetaEvents", () => {
  it("keeps everything when nothing narrows the scope", () => {
    const events = [event(), event({ id: "evt-2", slug: "nexus-night" })];
    expect(filterMetaEvents(events, { scope: {}, eras: ERAS })).toHaveLength(2);
  });

  it("treats the all-time era as no narrowing at all", () => {
    const events = [event({ eventDate: "2026-02-01" })];
    expect(filterMetaEvents(events, { scope: { era: ERA_ALL }, eras: ERAS })).toHaveLength(1);
  });

  it("narrows to one era's window, both ends inclusive", () => {
    const events = [
      event({ id: "before", eventDate: "2026-07-31" }),
      event({ id: "opening", eventDate: "2026-08-01" }),
      event({ id: "later", eventDate: "2026-09-20" }),
    ];
    const kept = filterMetaEvents(events, { scope: { era: "vendetta" }, eras: ERAS });
    expect(kept.map((row) => row.id)).toEqual(["opening", "later"]);
  });

  it("closes a past era at the day before the next one opens", () => {
    const events = [
      event({ id: "inside", eventDate: "2026-07-31" }),
      event({ id: "outside", eventDate: "2026-08-01" }),
    ];
    const kept = filterMetaEvents(events, { scope: { era: "origins" }, eras: ERAS });
    expect(kept.map((row) => row.id)).toEqual(["inside"]);
  });

  it("uses the custom range's own bounds", () => {
    const events = [
      event({ id: "in", eventDate: "2026-03-10" }),
      event({ id: "out", eventDate: "2026-04-10" }),
    ];
    const kept = filterMetaEvents(events, {
      scope: { era: ERA_CUSTOM, from: "2026-03-01", to: "2026-03-31" },
      eras: ERAS,
    });
    expect(kept.map((row) => row.id)).toEqual(["in"]);
  });

  it("narrows by format, tier and country together", () => {
    const events = [
      event({ id: "match", format: "standard", tier: "premier", country: "ES" }),
      event({ id: "wrong-tier", format: "standard", tier: "store", country: "ES" }),
      event({ id: "wrong-country", format: "standard", tier: "premier", country: "IT" }),
      event({ id: "wrong-format", format: "freeform", tier: "premier", country: "ES" }),
    ];
    const kept = filterMetaEvents(events, {
      scope: { format: "standard", tier: "premier", country: "ES" },
      eras: ERAS,
    });
    expect(kept.map((row) => row.id)).toEqual(["match"]);
  });

  it("matches the search against the name, organizer and venue, case-insensitively", () => {
    const events = [
      event({ id: "by-name", name: "Nexus Night" }),
      event({ id: "by-organizer", name: "Other", organizer: "Mana Vortex" }),
      event({ id: "by-venue", name: "Other", organizer: null, location: "Mana Vortex, Rotterdam" }),
      event({ id: "no-match", name: "Other", organizer: null, location: null }),
    ];
    expect(
      filterMetaEvents(events, { scope: {}, eras: ERAS, search: "  MANA vortex " }).map(
        (row) => row.id,
      ),
    ).toEqual(["by-organizer", "by-venue"]);
  });

  it("ignores a search of only whitespace", () => {
    expect(filterMetaEvents([event()], { scope: {}, eras: ERAS, search: "   " })).toHaveLength(1);
  });

  it("drops an era the set list no longer offers rather than emptying the page", () => {
    const events = [event({ eventDate: "2026-02-01" })];
    expect(filterMetaEvents(events, { scope: { era: "retired-set" }, eras: ERAS })).toHaveLength(1);
  });

  it("returns nothing for an empty archive", () => {
    expect(filterMetaEvents([], { scope: { tier: "premier" }, eras: ERAS })).toEqual([]);
  });
});

describe("metaEventCountries", () => {
  it("dedupes and sorts the codes the events cover", () => {
    const events = [
      event({ country: "IT" }),
      event({ country: "DE" }),
      event({ country: "IT" }),
      event({ country: "AT" }),
    ];
    expect(metaEventCountries(events)).toEqual(["AT", "DE", "IT"]);
  });

  it("leaves out events no source gave a country for", () => {
    expect(metaEventCountries([event({ country: null }), event({ country: "" })])).toEqual([]);
  });

  it("returns nothing for an empty archive", () => {
    expect(metaEventCountries([])).toEqual([]);
  });
});

describe("latestMetaWinners", () => {
  it("keeps only the events a rank-1 row is known for", () => {
    const events = [
      event({ id: "newest", eventDate: "2026-08-20", winners: [WINNER] }),
      event({ id: "pending", eventDate: "2026-08-19", winners: [] }),
      event({ id: "older", eventDate: "2026-08-18", winners: [WINNER] }),
    ];
    expect(latestMetaWinners(events, 3).map((row) => row.id)).toEqual(["newest", "older"]);
  });

  it("orders by event date rather than trusting the caller's order", () => {
    const events = [
      event({ id: "middle", eventDate: "2026-08-10", winners: [WINNER] }),
      event({ id: "oldest", eventDate: "2026-01-02", winners: [WINNER] }),
      event({ id: "newest", eventDate: "2026-09-30", winners: [WINNER] }),
    ];
    expect(latestMetaWinners(events, 3).map((row) => row.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("keeps every name of a tie at the top", () => {
    const events = [event({ winners: [WINNER, CO_WINNER] })];
    expect(latestMetaWinners(events, 3)[0].winners.map((row) => row.playerName)).toEqual([
      "Nova",
      "Ekko",
    ]);
  });

  it("counts events against the limit, not names", () => {
    const events = [
      event({ id: "a", eventDate: "2026-08-20", winners: [WINNER, CO_WINNER] }),
      event({ id: "b", eventDate: "2026-08-19", winners: [WINNER] }),
      event({ id: "c", eventDate: "2026-08-18", winners: [WINNER] }),
    ];
    expect(latestMetaWinners(events, 2).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("returns nothing when no event has archived standings", () => {
    expect(latestMetaWinners([event({ winners: [] })], 3)).toEqual([]);
  });
});

describe("metaDecksForEvents", () => {
  it("keeps only decks from the events in scope", () => {
    const decks = [
      deck({ deckId: "in" }),
      deck({
        deckId: "out",
        event: {
          slug: "other-event",
          name: "Other",
          eventDate: "2026-08-16",
          format: "standard",
        },
      }),
    ];
    expect(metaDecksForEvents(decks, [event()], 10).map((row) => row.deckId)).toEqual(["in"]);
  });

  it("orders by newest event, then best finish within a day", () => {
    const older = { slug: "older", name: "Older", eventDate: "2026-08-01", format: "standard" };
    const newer = { slug: "newer", name: "Newer", eventDate: "2026-08-20", format: "standard" };
    const decks = [
      deck({ deckId: "old-first", rank: 1, event: older }),
      deck({ deckId: "new-fourth", rank: 4, event: newer }),
      deck({ deckId: "new-first", rank: 1, event: newer }),
    ];
    const events = [event({ slug: "newer" }), event({ id: "evt-2", slug: "older" })];
    expect(metaDecksForEvents(decks, events, 10).map((row) => row.deckId)).toEqual([
      "new-first",
      "new-fourth",
      "old-first",
    ]);
  });

  it("stops at the limit", () => {
    const decks = [deck({ deckId: "a" }), deck({ deckId: "b" })];
    expect(metaDecksForEvents(decks, [event()], 1).map((row) => row.deckId)).toEqual(["a"]);
  });

  it("returns nothing when the scope holds no events", () => {
    expect(metaDecksForEvents([deck()], [], 10)).toEqual([]);
  });
});

describe("metaTiersByEventSlug", () => {
  it("keys each event's tier by its slug", () => {
    const map = metaTiersByEventSlug([
      event({ slug: "premier-event", tier: "premier" }),
      event({ slug: "store-event", tier: "store" }),
    ]);
    expect(map.get("premier-event")).toBe("premier");
    expect(map.get("store-event")).toBe("store");
  });

  it("has no entry for an event outside the list", () => {
    expect(metaTiersByEventSlug([event()]).get("missing")).toBeUndefined();
  });
});
