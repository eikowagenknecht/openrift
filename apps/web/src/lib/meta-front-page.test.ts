import type { MetaEventSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  filterMetaEvents,
  metaEventCountries,
  metaEventWinners,
  metaFrontSections,
  metaTierCounts,
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
    format: "constructed",
    tier: "store",
    country: "DE",
    location: "Rift Games, Berlin",
    playerCount: 32,
    organizer: "Rift Games Berlin",
    playerRowCount: 32,
    deckCount: 4,
    topFinishes: [],
    ...overrides,
  };
}

const WINNER = {
  rank: 1,
  rankIsTier: false,
  playerName: "Nova",
  playerKey: "u2001",
  wins: 6,
  losses: 1,
  draws: 0,
  legend: {
    cardId: "legend-1",
    name: "Kennen, Heart of the Tempest",
    slug: "kennen",
    imageId: null,
    domains: ["chaos", "order"],
    archiveSlug: "kennen-kennen",
  },
};

const CO_WINNER = { ...WINNER, playerName: "Ekko" };
const RUNNER_UP = { ...WINNER, playerName: "Rell", rank: 2 };

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

  it("keeps an event standing on either bound of a custom range", () => {
    const events = [
      event({ id: "on-from", eventDate: "2026-03-01" }),
      event({ id: "on-to", eventDate: "2026-03-31" }),
      event({ id: "day-after", eventDate: "2026-04-01" }),
      event({ id: "day-before", eventDate: "2026-02-28" }),
    ];
    const kept = filterMetaEvents(events, {
      scope: { era: ERA_CUSTOM, from: "2026-03-01", to: "2026-03-31" },
      eras: ERAS,
    });
    expect(kept.map((row) => row.id)).toEqual(["on-from", "on-to"]);
  });

  it("matches a country whichever case either side arrives in", () => {
    const events = [event({ id: "spain", country: "es" }), event({ id: "italy", country: "IT" })];
    expect(
      filterMetaEvents(events, { scope: { countries: ["ES"] }, eras: ERAS }).map((row) => row.id),
    ).toEqual(["spain"]);
  });

  it("ignores a country code the list cannot resolve rather than emptying the page", () => {
    expect(filterMetaEvents([event()], { scope: { countries: ["??"] }, eras: ERAS })).toHaveLength(
      1,
    );
  });

  it("narrows by format, tier and country together", () => {
    const events = [
      event({ id: "match", format: "constructed", tier: "premier", country: "ES" }),
      event({ id: "wrong-tier", format: "constructed", tier: "store", country: "ES" }),
      event({ id: "wrong-country", format: "constructed", tier: "premier", country: "IT" }),
      event({ id: "wrong-format", format: "freeform", tier: "premier", country: "ES" }),
    ];
    const kept = filterMetaEvents(events, {
      scope: { formats: ["constructed"], tiers: ["premier"], countries: ["ES"] },
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
    expect(filterMetaEvents([], { scope: { tiers: ["premier"] }, eras: ERAS })).toEqual([]);
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

describe("metaEventWinners", () => {
  it("keeps only the rank-1 rows of the podium", () => {
    const row = event({ topFinishes: [WINNER, CO_WINNER, RUNNER_UP] });
    expect(metaEventWinners(row).map((finish) => finish.playerName)).toEqual(["Nova", "Ekko"]);
  });

  it("names no winner for an event whose standings have not arrived", () => {
    expect(metaEventWinners(event({ topFinishes: [] }))).toEqual([]);
  });
});

describe("metaFrontSections", () => {
  const TODAY = "2026-09-02";

  it("splits events into the three tier buckets, store and casual sharing one", () => {
    const sections = metaFrontSections(
      [
        event({ id: "p", tier: "premier" }),
        event({ id: "c", tier: "competitive" }),
        event({ id: "s", tier: "store" }),
        event({ id: "x", tier: "casual" }),
      ],
      TODAY,
    );
    expect(sections.premier.map((row) => row.id)).toEqual(["p"]);
    expect(sections.competitive.map((row) => row.id)).toEqual(["c"]);
    expect(sections.community.map((row) => row.id)).toEqual(["s", "x"]);
  });

  it("orders each bucket newest first rather than trusting the caller's order", () => {
    const sections = metaFrontSections(
      [
        event({ id: "middle", tier: "premier", eventDate: "2026-08-10" }),
        event({ id: "oldest", tier: "premier", eventDate: "2026-01-02" }),
        event({ id: "newest", tier: "premier", eventDate: "2026-08-20" }),
      ],
      TODAY,
    );
    expect(sections.premier.map((row) => row.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("leaves every bucket empty for an empty archive", () => {
    expect(metaFrontSections([], TODAY)).toEqual({
      premier: [],
      competitive: [],
      community: [],
      upcoming: [],
    });
  });

  it("puts a future event with no results in upcoming, not its tier bucket", () => {
    const sections = metaFrontSections(
      [event({ id: "future", tier: "premier", eventDate: "2026-09-10", playerRowCount: 0 })],
      TODAY,
    );
    expect(sections.premier).toEqual([]);
    expect(sections.upcoming.map((row) => row.id)).toEqual(["future"]);
  });

  it("puts a played event with no standings in no bucket at all", () => {
    const sections = metaFrontSections(
      [event({ id: "empty", tier: "premier", eventDate: "2026-08-01", playerRowCount: 0 })],
      TODAY,
    );
    expect(sections.premier).toEqual([]);
    expect(sections.upcoming).toEqual([]);
  });

  it("does not treat an event dated exactly today as upcoming", () => {
    const sections = metaFrontSections(
      [event({ id: "today", tier: "premier", eventDate: TODAY })],
      TODAY,
    );
    expect(sections.upcoming).toEqual([]);
  });

  it("orders upcoming soonest first", () => {
    const sections = metaFrontSections(
      [
        event({ id: "later", tier: "premier", eventDate: "2026-10-01" }),
        event({ id: "sooner", tier: "premier", eventDate: "2026-09-05" }),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((row) => row.id)).toEqual(["sooner", "later"]);
  });

  it("breaks a same-day upcoming tie by tier, then name", () => {
    const sections = metaFrontSections(
      [
        event({ id: "casual", name: "Zed", tier: "casual", eventDate: "2026-09-10" }),
        event({ id: "store", name: "Alpha", tier: "store", eventDate: "2026-09-10" }),
        event({ id: "competitive", name: "Beta", tier: "competitive", eventDate: "2026-09-10" }),
        event({ id: "premier", name: "Gamma", tier: "premier", eventDate: "2026-09-10" }),
        event({ id: "store-2", name: "Zulu", tier: "store", eventDate: "2026-09-10" }),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((row) => row.id)).toEqual([
      "premier",
      "competitive",
      "store",
      "store-2",
      "casual",
    ]);
  });
});

describe("metaTierCounts", () => {
  it("counts every event by tier, results or not", () => {
    expect(
      metaTierCounts([
        event({ id: "p1", tier: "premier", playerRowCount: 0 }),
        event({ id: "p2", tier: "premier" }),
        event({ id: "c", tier: "competitive" }),
        event({ id: "s", tier: "store" }),
        event({ id: "x", tier: "casual" }),
      ]),
    ).toEqual({ premier: 2, competitive: 1, community: 2 });
  });

  it("counts a future event same as a played one", () => {
    expect(
      metaTierCounts([event({ id: "future", tier: "premier", eventDate: "2099-01-01" })]),
    ).toEqual({ premier: 1, competitive: 0, community: 0 });
  });

  it("returns zeros for an empty archive", () => {
    expect(metaTierCounts([])).toEqual({ premier: 0, competitive: 0, community: 0 });
  });
});
