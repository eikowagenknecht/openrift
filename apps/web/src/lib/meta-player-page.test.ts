import type { MetaDeckSummary } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  filterPlayerFinishes,
  metaPlayerCounts,
  metaPlayerCountries,
  metaPlayerDecks,
  metaPlayerFacts,
  metaPlayerLegends,
  sortPlayerFinishes,
} from "@/lib/meta-player-page";
import type { MetaEra } from "@/lib/meta-scope";
import { ERA_ALL } from "@/lib/meta-scope";
import { makeMetaPlayerFinish, resetIdCounter } from "@/test/factories";

// Newest first, as the eras hook returns them; the first is the current set.
const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
];

// Opened all the way up: an absent era and format would mean the current set
// and constructed, which is a scope, not the absence of one.
const ALL_TIME = { scope: { era: ERA_ALL, formats: [] }, eras: ERAS };

const LUX = {
  cardId: "legend-lux",
  name: "Lux, Lady of Luminosity",
  slug: "lady-of-luminosity",
  imageId: "img-lux",
  domains: ["calm"],
  archiveSlug: "lux-lady-of-luminosity",
};

const VI = {
  cardId: "legend-vi",
  name: "Vi, Piltover's Enforcer",
  slug: "piltovers-enforcer",
  imageId: "img-vi",
  domains: ["fury"],
  archiveSlug: "vi-piltovers-enforcer",
};

type DeckOverrides = Partial<Omit<MetaDeckSummary, "event">> & {
  event?: Partial<MetaDeckSummary["event"]>;
};

function deck({ event, ...overrides }: DeckOverrides = {}): MetaDeckSummary {
  return {
    playerId: "p1",
    deckId: "d1",
    shareToken: "tok-1",
    listStatus: "full",
    name: "Luminous Skirmish",
    format: "constructed",
    legendCardId: LUX.cardId,
    legendName: LUX.name,
    legendSlug: LUX.slug,
    legendArchiveSlug: LUX.archiveSlug,
    legendImageId: LUX.imageId,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "Renata",
    playerKey: "pnrenata",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: 0,
    ...overrides,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      ...event,
    },
  };
}

beforeEach(() => {
  resetIdCounter();
});

describe("metaPlayerCounts", () => {
  it("counts wins, top 8s, finishes and the decks the grid renders", () => {
    const finishes = [
      makeMetaPlayerFinish({ rank: 1, shareToken: "tok-1", event: { slug: "a" } }),
      makeMetaPlayerFinish({ rank: 4, shareToken: "tok-2", event: { slug: "b" } }),
      makeMetaPlayerFinish({ rank: 17, shareToken: null, event: { slug: "c" } }),
    ];
    expect(metaPlayerCounts(finishes)).toEqual({
      eventWins: 1,
      topEights: 2,
      finishes: 3,
      decklists: 2,
    });
  });

  it("counts a shared first place as one event win, not two rows", () => {
    const finishes = [
      makeMetaPlayerFinish({ rank: 1, event: { slug: "twin" } }),
      makeMetaPlayerFinish({ rank: 1, event: { slug: "twin" } }),
    ];
    expect(metaPlayerCounts(finishes).eventWins).toBe(1);
  });

  it("takes a rank of exactly 8 as a top 8 and 9 as outside it", () => {
    const finishes = [
      makeMetaPlayerFinish({ rank: 8, event: { slug: "a" } }),
      makeMetaPlayerFinish({ rank: 9, event: { slug: "b" } }),
    ];
    expect(metaPlayerCounts(finishes).topEights).toBe(1);
  });

  it("counts the lists the record claims, without waiting for the deck payload", () => {
    const finishes = [
      makeMetaPlayerFinish({ shareToken: "tok-1", event: { slug: "a" } }),
      makeMetaPlayerFinish({ shareToken: null, event: { slug: "b" } }),
    ];
    expect(metaPlayerCounts(finishes).decklists).toBe(1);
  });

  it("reports zeroes for a record the scope emptied", () => {
    expect(metaPlayerCounts([])).toEqual({
      eventWins: 0,
      topEights: 0,
      finishes: 0,
      decklists: 0,
    });
  });
});

describe("filterPlayerFinishes", () => {
  it("keeps only the finishes inside the era", () => {
    const finishes = [
      makeMetaPlayerFinish({ event: { slug: "new", eventDate: "2026-08-10" } }),
      makeMetaPlayerFinish({ event: { slug: "old", eventDate: "2026-03-10" } }),
    ];
    const kept = filterPlayerFinishes(finishes, { scope: { era: "vendetta" }, eras: ERAS });
    expect(kept.map((finish) => finish.event.slug)).toEqual(["new"]);
  });

  it("narrows by country and by tier", () => {
    const finishes = [
      makeMetaPlayerFinish({ event: { slug: "de", country: "DE", tier: "local" } }),
      makeMetaPlayerFinish({ event: { slug: "fr", country: "FR", tier: "local" } }),
      makeMetaPlayerFinish({ event: { slug: "de-major", country: "DE", tier: "competitive" } }),
    ];
    expect(
      filterPlayerFinishes(finishes, {
        scope: { ...ALL_TIME.scope, countries: ["DE"], tiers: ["local"] },
        eras: ERAS,
      }).map((finish) => finish.event.slug),
    ).toEqual(["de"]);
  });

  it("keeps the whole record when the scope is open", () => {
    const finishes = [makeMetaPlayerFinish(), makeMetaPlayerFinish()];
    expect(filterPlayerFinishes(finishes, ALL_TIME)).toHaveLength(2);
  });
});

describe("sortPlayerFinishes", () => {
  const finishes = [
    makeMetaPlayerFinish({ rank: 4, event: { slug: "mid", eventDate: "2026-06-01" } }),
    makeMetaPlayerFinish({ rank: 1, event: { slug: "old", eventDate: "2026-02-01" } }),
    makeMetaPlayerFinish({ rank: 1, event: { slug: "new", eventDate: "2026-08-01" } }),
  ];

  it("leads best with the placings, newest of an equal placing first", () => {
    expect(sortPlayerFinishes(finishes, "best").map((finish) => finish.event.slug)).toEqual([
      "new",
      "old",
      "mid",
    ]);
  });

  it("orders all by date, better placing first inside one day", () => {
    expect(sortPlayerFinishes(finishes, "all").map((finish) => finish.event.slug)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("breaks a full tie on the event name so the order is stable", () => {
    const tied = [
      makeMetaPlayerFinish({ event: { slug: "omega", name: "Omega Skirmish" } }),
      makeMetaPlayerFinish({ event: { slug: "alpha", name: "Alpha Skirmish" } }),
    ];
    expect(sortPlayerFinishes(tied, "best").map((finish) => finish.event.slug)).toEqual([
      "alpha",
      "omega",
    ]);
  });

  it("leaves the caller's array alone and handles an empty record", () => {
    const input = [...finishes];
    sortPlayerFinishes(input, "best");
    expect(input.map((finish) => finish.event.slug)).toEqual(["mid", "old", "new"]);
    expect(sortPlayerFinishes([], "best")).toEqual([]);
  });
});

describe("metaPlayerLegends", () => {
  it("groups by legend, most-played first, and counts events won", () => {
    const result = metaPlayerLegends([
      makeMetaPlayerFinish({ legend: LUX, rank: 1, event: { slug: "a" } }),
      makeMetaPlayerFinish({ legend: LUX, rank: 6, event: { slug: "b" } }),
      makeMetaPlayerFinish({ legend: VI, rank: 1, event: { slug: "c" } }),
    ]);
    expect(result.entries).toEqual([
      { legend: LUX, finishes: 2, wins: 1, bestRank: 1 },
      { legend: VI, finishes: 1, wins: 1, bestRank: 1 },
    ]);
    expect(result.withoutLegend).toBe(0);
  });

  it("counts a shared first place as one win for that legend", () => {
    const [entry] = metaPlayerLegends([
      makeMetaPlayerFinish({ legend: LUX, rank: 1, event: { slug: "twin" } }),
      makeMetaPlayerFinish({ legend: LUX, rank: 1, event: { slug: "twin" } }),
    ]).entries;
    expect(entry?.wins).toBe(1);
  });

  it("breaks an equal count on the better placing", () => {
    const result = metaPlayerLegends([
      makeMetaPlayerFinish({ legend: VI, rank: 12, event: { slug: "a" } }),
      makeMetaPlayerFinish({ legend: LUX, rank: 3, event: { slug: "b" } }),
    ]);
    expect(result.entries.map((entry) => entry.legend.cardId)).toEqual([LUX.cardId, VI.cardId]);
  });

  it("counts the finishes no source named a legend for and lists none of them", () => {
    const result = metaPlayerLegends([
      makeMetaPlayerFinish({ legend: null, event: { slug: "a" } }),
      makeMetaPlayerFinish({ legend: null, event: { slug: "b" } }),
      makeMetaPlayerFinish({ legend: LUX, event: { slug: "c" } }),
    ]);
    expect(result.withoutLegend).toBe(2);
    expect(result.entries).toHaveLength(1);
  });

  it("returns nothing for an empty record", () => {
    expect(metaPlayerLegends([])).toEqual({ entries: [], withoutLegend: 0 });
  });
});

describe("metaPlayerDecks", () => {
  it("keeps the archived lists the player's own finishes point at", () => {
    const finishes = [
      makeMetaPlayerFinish({ shareToken: "tok-1", event: { slug: "a" } }),
      makeMetaPlayerFinish({ shareToken: null, event: { slug: "b" } }),
    ];
    const decks = [deck({ shareToken: "tok-1" }), deck({ deckId: "d2", shareToken: "tok-9" })];
    expect(metaPlayerDecks(decks, finishes).map((entry) => entry.deckId)).toEqual(["d1"]);
  });

  it("keeps nothing when no finish has a list on file", () => {
    const finishes = [makeMetaPlayerFinish({ shareToken: null })];
    expect(metaPlayerDecks([deck()], finishes)).toEqual([]);
  });
});

describe("metaPlayerFacts", () => {
  it("states the busiest country, the span of the record and the top legend", () => {
    const facts = metaPlayerFacts([
      makeMetaPlayerFinish({
        legend: LUX,
        event: { slug: "a", country: "DE", eventDate: "2026-08-01" },
      }),
      makeMetaPlayerFinish({
        legend: LUX,
        event: { slug: "b", country: "DE", eventDate: "2026-03-14" },
      }),
      makeMetaPlayerFinish({
        legend: VI,
        event: { slug: "c", country: "FR", eventDate: "2026-05-02" },
      }),
    ]);
    expect(facts).toEqual({
      country: "DE",
      firstDate: "2026-03-14",
      lastDate: "2026-08-01",
      topLegend: LUX,
    });
  });

  it("uppercases a lowercase source code and ignores events with no venue", () => {
    const facts = metaPlayerFacts([
      makeMetaPlayerFinish({ event: { slug: "a", country: "fr" } }),
      makeMetaPlayerFinish({ event: { slug: "b", country: null } }),
    ]);
    expect(facts.country).toBe("FR");
  });

  it("breaks a country tie on the code so the line does not flip", () => {
    const facts = metaPlayerFacts([
      makeMetaPlayerFinish({ event: { slug: "a", country: "FR" } }),
      makeMetaPlayerFinish({ event: { slug: "b", country: "DE" } }),
    ]);
    expect(facts.country).toBe("DE");
  });

  it("leaves every part empty for a record with nothing in it", () => {
    expect(metaPlayerFacts([])).toEqual({
      country: null,
      firstDate: null,
      lastDate: null,
      topLegend: null,
    });
  });

  it("has no top legend when no finish names one", () => {
    expect(metaPlayerFacts([makeMetaPlayerFinish({ legend: null })]).topLegend).toBeNull();
  });
});

describe("metaPlayerCountries", () => {
  it("offers every country the whole record touches, alphabetically", () => {
    const finishes = [
      makeMetaPlayerFinish({ event: { slug: "a", country: "fr" } }),
      makeMetaPlayerFinish({ event: { slug: "b", country: null } }),
      makeMetaPlayerFinish({ shareToken: "tok-1", event: { slug: "c", country: "DE" } }),
    ];
    expect(metaPlayerCountries(finishes)).toEqual(["DE", "FR"]);
  });
});
