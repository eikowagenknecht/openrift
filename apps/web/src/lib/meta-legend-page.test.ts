import type {
  MetaDeckSummary,
  MetaEventSummary,
  MetaLegendEventRecord,
  MetaLegendFinish,
  MetaLegendSummary,
} from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  filterLegendDecks,
  filterLegendFinishes,
  metaLegendCounts,
  metaLegendCountries,
  metaLegendDecks,
  metaLegendIndexCountries,
  metaLegendIndexEntries,
  nextLegendSort,
  sortLegendFinishes,
  sortMetaLegendEntries,
} from "@/lib/meta-legend-page";
import type { MetaEra } from "@/lib/meta-scope";
import { ERA_ALL } from "@/lib/meta-scope";

// Newest first, as the eras hook returns them; the first is the current set.
const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
];

// Opened all the way up: an absent era and format would mean the current set
// and constructed, which is a scope, not the absence of one.
const ALL_TIME = { scope: { era: ERA_ALL, formats: [] }, eras: ERAS };

type FinishOverrides = Partial<Omit<MetaLegendFinish, "event">> & {
  event?: Partial<MetaLegendFinish["event"]>;
};

function finish({ event, ...overrides }: FinishOverrides = {}): MetaLegendFinish {
  return {
    playerId: "p1",
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    ...overrides,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "store",
      country: "DE",
      playerCount: 64,
      ...event,
    },
  };
}

type DeckOverrides = Partial<Omit<MetaDeckSummary, "event">> & {
  event?: Partial<MetaDeckSummary["event"]>;
};

function deck({ event, ...overrides }: DeckOverrides = {}): MetaDeckSummary {
  return {
    playerId: "p1",
    deckId: "d1",
    shareToken: "tok-1",
    listStatus: "full",
    name: "Kennen Tempo",
    format: "constructed",
    legendCardId: "legend-1",
    legendName: "Kennen, Heart of the Tempest",
    legendSlug: "heart-of-the-tempest",
    legendArchiveSlug: null,
    legendImageId: null,
    championCardId: null,
    championName: null,
    championImageId: null,
    playerName: "Renata",
    rank: 1,
    rankIsTier: false,
    wins: 12,
    losses: 1,
    draws: 0,
    ...overrides,
    event: {
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "store",
      country: "DE",
      ...event,
    },
  };
}

function legendSummary(
  name: string,
  slug: string,
  records: MetaLegendEventRecord[] = [],
): MetaLegendSummary {
  return {
    slug,
    legend: { cardId: slug, name, slug, imageId: null, domains: [], archiveSlug: slug },
    records,
  };
}

function record(
  eventSlug: string,
  overrides: Partial<MetaLegendEventRecord> = {},
): MetaLegendEventRecord {
  return {
    eventSlug,
    bestRank: 8,
    rankIsTier: false,
    finishes: 1,
    decklists: 0,
    won: false,
    ...overrides,
  };
}

function eventSummary(slug: string, overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: slug,
    slug,
    name: `Event ${slug}`,
    eventDate: "2026-08-01",
    format: "constructed",
    tier: "store",
    country: "DE",
    location: null,
    playerCount: 64,
    organizer: null,
    playerRowCount: 8,
    deckCount: 2,
    topFinishes: [],
    ...overrides,
  };
}

describe("metaLegendCounts", () => {
  it("counts wins, finishes and the lists the grid will render", () => {
    const counts = metaLegendCounts(
      [
        finish(),
        finish({ playerId: "p2", rank: 4 }),
        finish({ playerId: "p3", rank: 1, event: { slug: "regional-lyon" } }),
      ],
      [deck(), deck({ deckId: "d2" })],
    );
    expect(counts).toEqual({ eventWins: 2, finishes: 3, decklists: 2 });
  });

  it("counts a shared first place as one win, not two", () => {
    const counts = metaLegendCounts(
      [finish({ playerId: "a", rank: 1 }), finish({ playerId: "b", rank: 1 })],
      [],
    );
    expect(counts.eventWins).toBe(1);
    expect(counts.finishes).toBe(2);
  });

  it("counts a cut bucket at rank 1 as a win, since that is what the source published", () => {
    const counts = metaLegendCounts([finish({ rankIsTier: true })], []);
    expect(counts.eventWins).toBe(1);
  });

  it("reports zeros for a legend with nothing on file", () => {
    expect(metaLegendCounts([], [])).toEqual({ eventWins: 0, finishes: 0, decklists: 0 });
  });

  it("never claims more lists than the grid shows", () => {
    const counts = metaLegendCounts([finish({ shareToken: "tok-1", listStatus: "full" })], []);
    expect(counts.decklists).toBe(0);
  });
});

describe("metaLegendDecks", () => {
  it("keeps only the decks filed under the legend", () => {
    const mine = deck();
    const other = deck({ deckId: "d2", legendCardId: "legend-2" });
    expect(metaLegendDecks([mine, other], "legend-1")).toEqual([mine]);
  });

  it("returns nothing when the archive holds no list for the legend", () => {
    expect(metaLegendDecks([deck({ legendCardId: "legend-2" })], "legend-1")).toEqual([]);
  });

  it("never matches a deck whose legend zone is empty", () => {
    expect(metaLegendDecks([deck({ legendCardId: null })], "legend-1")).toEqual([]);
  });
});

describe("filterLegendDecks", () => {
  it("keeps every deck when nothing narrows them", () => {
    expect(filterLegendDecks([deck(), deck({ deckId: "d2" })], ALL_TIME)).toHaveLength(2);
  });

  it("drops a deck whose event falls outside the scope", () => {
    const inside = deck({ deckId: "in", event: { eventDate: "2026-08-20" } });
    const outside = deck({ deckId: "out", event: { eventDate: "2026-03-02" } });
    const kept = filterLegendDecks([inside, outside], { scope: { era: "vendetta" }, eras: ERAS });
    expect(kept.map((entry) => entry.deckId)).toEqual(["in"]);
  });

  it("narrows by tier, format and country the same way the finishes do", () => {
    const decks = [
      deck({ deckId: "a", event: { tier: "premier", country: "FR" } }),
      deck({ deckId: "b", event: { tier: "store", country: "DE" } }),
    ];
    expect(
      filterLegendDecks(decks, { scope: { tiers: ["premier"] }, eras: ERAS }).map(
        (entry) => entry.deckId,
      ),
    ).toEqual(["a"]);
    expect(
      filterLegendDecks(decks, { scope: { countries: ["de"] }, eras: ERAS }).map(
        (entry) => entry.deckId,
      ),
    ).toEqual(["b"]);
    expect(filterLegendDecks(decks, { scope: { formats: ["limited"] }, eras: ERAS })).toEqual([]);
  });
});

describe("filterLegendFinishes", () => {
  const premier = finish({
    playerId: "p1",
    event: { slug: "worlds", tier: "premier", country: "FR", eventDate: "2026-08-20" },
  });
  const store = finish({
    playerId: "p2",
    event: { slug: "store-night", tier: "store", country: "DE", eventDate: "2026-03-02" },
  });

  it("keeps the whole record when nothing narrows it", () => {
    expect(filterLegendFinishes([premier, store], ALL_TIME)).toHaveLength(2);
  });

  it("keeps only the finishes inside the chosen era", () => {
    const kept = filterLegendFinishes([premier, store], { scope: { era: "origins" }, eras: ERAS });
    expect(kept.map((entry) => entry.playerId)).toEqual(["p2"]);
  });

  it("reads a custom range as an inclusive window", () => {
    const scope = { era: "custom", from: "2026-08-20", to: "2026-08-20" };
    expect(
      filterLegendFinishes([premier, store], { scope, eras: ERAS }).map((entry) => entry.playerId),
    ).toEqual(["p1"]);
  });

  it("narrows by tier, format and country", () => {
    expect(
      filterLegendFinishes([premier, store], { scope: { tiers: ["premier"] }, eras: ERAS }).map(
        (entry) => entry.playerId,
      ),
    ).toEqual(["p1"]);
    expect(
      filterLegendFinishes([premier, store], { scope: { countries: ["fr"] }, eras: ERAS }).map(
        (entry) => entry.playerId,
      ),
    ).toEqual(["p1"]);
    expect(
      filterLegendFinishes([premier, store], { scope: { formats: ["draft"] }, eras: ERAS }),
    ).toEqual([]);
  });

  it("treats an era the set list no longer knows as no narrowing", () => {
    expect(
      filterLegendFinishes([premier, store], { scope: { era: "retired-set" }, eras: ERAS }),
    ).toHaveLength(2);
  });

  it("leaves the caller's array alone and handles an empty record", () => {
    const input = [premier, store];
    filterLegendFinishes(input, { scope: { tiers: ["premier"] }, eras: ERAS });
    expect(input).toHaveLength(2);
    expect(filterLegendFinishes([], { scope: { tiers: ["premier"] }, eras: ERAS })).toEqual([]);
  });
});

describe("metaLegendCountries", () => {
  it("offers each country the record covers once, alphabetically", () => {
    expect(
      metaLegendCountries(
        [
          finish({ playerId: "a", event: { country: "it" } }),
          finish({ playerId: "b", event: { country: "AT" } }),
          finish({ playerId: "c", event: { country: "IT" } }),
        ],
        [],
      ),
    ).toEqual(["AT", "IT"]);
  });

  it("offers a country only an archived list reaches", () => {
    expect(
      metaLegendCountries(
        [finish({ event: { country: "AT" } })],
        [deck({ event: { country: "JP" } })],
      ),
    ).toEqual(["AT", "JP"]);
  });

  it("offers nothing for events no source gave a venue", () => {
    expect(
      metaLegendCountries(
        [
          finish({ playerId: "a", event: { country: null } }),
          finish({ playerId: "b", event: { country: "??" } }),
        ],
        [deck({ event: { country: null } })],
      ),
    ).toEqual([]);
  });

  it("offers nothing for an empty record", () => {
    expect(metaLegendCountries([], [])).toEqual([]);
  });
});

describe("sortLegendFinishes", () => {
  const first = finish({ playerId: "a", rank: 1, event: { eventDate: "2026-01-01" } });
  const recentEighth = finish({ playerId: "b", rank: 8, event: { eventDate: "2026-09-01" } });
  const olderSecond = finish({ playerId: "c", rank: 2, event: { eventDate: "2026-03-01" } });
  const recentSecond = finish({ playerId: "d", rank: 2, event: { eventDate: "2026-06-01" } });

  it("leads the best view with the best placing, newest of an equal placing first", () => {
    const sorted = sortLegendFinishes([recentEighth, olderSecond, first, recentSecond], "best");
    expect(sorted.map((entry) => entry.playerId)).toEqual(["a", "d", "c", "b"]);
  });

  it("orders the all view by date, best placing first inside one day", () => {
    const sameDay = finish({ playerId: "e", rank: 1, event: { eventDate: "2026-09-01" } });
    const sorted = sortLegendFinishes([recentEighth, sameDay, first], "all");
    expect(sorted.map((entry) => entry.playerId)).toEqual(["e", "b", "a"]);
  });

  it("breaks a full tie on the event name so the order is stable", () => {
    const alpha = finish({ playerId: "x", event: { name: "Alpha City Challenge" } });
    const omega = finish({ playerId: "y", event: { name: "Omega City Challenge" } });
    expect(sortLegendFinishes([omega, alpha], "best").map((entry) => entry.playerId)).toEqual([
      "x",
      "y",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const input = [recentEighth, first];
    sortLegendFinishes(input, "best");
    expect(input.map((entry) => entry.playerId)).toEqual(["b", "a"]);
  });

  it("handles an empty record", () => {
    expect(sortLegendFinishes([], "best")).toEqual([]);
  });
});

describe("metaLegendIndexEntries", () => {
  // Newest event first, as the records arrive.
  const kennen = legendSummary("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", [
    record("skirmish", { bestRank: 4, finishes: 2, decklists: 1 }),
    record("regional-lyon", { bestRank: 2, rankIsTier: true, finishes: 3, decklists: 2 }),
  ]);
  const azir = legendSummary("Azir, Emperor of the Sands", "azir-emperor-of-the-sands", [
    record("regional-lyon", { bestRank: 1, finishes: 1, decklists: 1, won: true }),
  ]);
  const events = [
    eventSummary("skirmish", { eventDate: "2026-08-15", tier: "store" }),
    eventSummary("regional-lyon", { eventDate: "2026-02-01", tier: "competitive", country: "FR" }),
  ];

  it("folds a legend's scoped records into the row's facts", () => {
    const entries = metaLegendIndexEntries([kennen, azir], events, ALL_TIME);
    const row = entries.find((entry) => entry.slug === "kennen-heart-of-the-tempest");
    expect(row).toMatchObject({ finishes: 5, decklists: 3, eventWins: 0 });
    expect(row?.bestFinish).toMatchObject({
      rank: 2,
      rankIsTier: true,
      event: { slug: "regional-lyon" },
    });
  });

  it("counts an event won and keeps the winning row's best finish", () => {
    const entries = metaLegendIndexEntries([azir], events, ALL_TIME);
    expect(entries[0]).toMatchObject({ eventWins: 1, bestFinish: { rank: 1 } });
  });

  it("keeps the newest event of an equal best placing", () => {
    const twice = legendSummary("Kennen, Heart of the Tempest", "kennen", [
      record("skirmish", { bestRank: 2 }),
      record("regional-lyon", { bestRank: 2 }),
    ]);
    const entries = metaLegendIndexEntries([twice], events, ALL_TIME);
    expect(entries[0].bestFinish.event.slug).toBe("skirmish");
  });

  it("recomputes the facts inside the scope", () => {
    const entries = metaLegendIndexEntries([kennen], events, {
      scope: { era: ERA_ALL, formats: [], tiers: ["competitive"] },
      eras: ERAS,
    });
    expect(entries[0]).toMatchObject({ finishes: 3, decklists: 2 });
    expect(entries[0].bestFinish.event.slug).toBe("regional-lyon");
  });

  it("drops a legend with no finish in scope", () => {
    const entries = metaLegendIndexEntries([kennen, azir], events, {
      scope: { era: ERA_ALL, formats: [], tiers: ["store"] },
      eras: ERAS,
    });
    expect(entries.map((entry) => entry.slug)).toEqual(["kennen-heart-of-the-tempest"]);
  });

  it("ignores a record whose event the payload does not hold", () => {
    const orphaned = legendSummary("Azir, Emperor of the Sands", "azir", [
      record("vanished-event", { bestRank: 1 }),
    ]);
    expect(metaLegendIndexEntries([orphaned], events, ALL_TIME)).toEqual([]);
  });

  it("matches the epithet as well as the champion, ignoring case and space", () => {
    const all = [kennen, azir];
    const bySearch = (needle: string) =>
      metaLegendIndexEntries(all, events, { ...ALL_TIME, search: needle }).map(
        (entry) => entry.slug,
      );
    expect(bySearch("tempest")).toEqual(["kennen-heart-of-the-tempest"]);
    expect(bySearch("  AZIR ")).toEqual(["azir-emperor-of-the-sands"]);
    expect(bySearch("   ")).toHaveLength(2);
    expect(bySearch("teemo")).toEqual([]);
  });
});

describe("sortMetaLegendEntries", () => {
  const events = [
    eventSummary("newer", { eventDate: "2026-08-15" }),
    eventSummary("older", { eventDate: "2026-02-01" }),
  ];
  const entriesFor = (...legends: MetaLegendSummary[]) =>
    metaLegendIndexEntries(legends, events, ALL_TIME);
  const kennen = legendSummary("Kennen, Heart of the Tempest", "kennen", [
    record("newer", { bestRank: 4, finishes: 9, decklists: 1 }),
  ]);
  const azir = legendSummary("Azir, Emperor of the Sands", "azir", [
    record("older", { bestRank: 1, finishes: 2, decklists: 5, won: true }),
  ]);

  it("orders by the champion-led name by default and flips with the direction", () => {
    const entries = entriesFor(kennen, azir);
    expect(sortMetaLegendEntries(entries).map((entry) => entry.slug)).toEqual(["azir", "kennen"]);
    expect(sortMetaLegendEntries(entries, "name", "desc").map((entry) => entry.slug)).toEqual([
      "kennen",
      "azir",
    ]);
  });

  it("orders best placings first, the newest of an equal placing ahead", () => {
    const alsoFirst = legendSummary("Viktor, Herald of the Arcane", "viktor", [
      record("newer", { bestRank: 1 }),
    ]);
    const sorted = sortMetaLegendEntries(entriesFor(kennen, azir, alsoFirst), "best", "asc");
    expect(sorted.map((entry) => entry.slug)).toEqual(["viktor", "azir", "kennen"]);
  });

  it("orders the count columns with a name tiebreak", () => {
    const entries = entriesFor(kennen, azir);
    expect(sortMetaLegendEntries(entries, "decklists", "desc")[0].slug).toBe("azir");
    expect(sortMetaLegendEntries(entries, "finishes", "desc")[0].slug).toBe("kennen");
    const tied = entriesFor(
      legendSummary("Kennen, Heart of the Tempest", "kennen", [record("newer", { finishes: 3 })]),
      legendSummary("Azir, Emperor of the Sands", "azir", [record("older", { finishes: 3 })]),
    );
    expect(sortMetaLegendEntries(tied, "finishes", "desc").map((entry) => entry.slug)).toEqual([
      "azir",
      "kennen",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const entries = entriesFor(kennen, azir);
    const input = [...entries];
    sortMetaLegendEntries(input, "best", "asc");
    expect(input).toEqual(entries);
  });
});

describe("nextLegendSort", () => {
  it("flips the direction on the active column", () => {
    expect(nextLegendSort({ sort: "name", direction: "asc" }, "name")).toEqual({
      sort: "name",
      direction: "desc",
    });
  });

  it("starts a new column at its most interesting order", () => {
    const from = { sort: "name", direction: "asc" } as const;
    expect(nextLegendSort(from, "best")).toEqual({ sort: "best", direction: "asc" });
    expect(nextLegendSort(from, "decklists")).toEqual({ sort: "decklists", direction: "desc" });
    expect(nextLegendSort(from, "finishes")).toEqual({ sort: "finishes", direction: "desc" });
  });
});

describe("metaLegendIndexCountries", () => {
  it("offers only the venues the legends' records reference, sorted", () => {
    const legends = [
      legendSummary("Kennen, Heart of the Tempest", "kennen", [record("de"), record("fr")]),
    ];
    const events = [
      eventSummary("de", { country: "DE" }),
      eventSummary("fr", { country: "FR" }),
      eventSummary("us", { country: "US" }),
      eventSummary("nowhere", { country: null }),
    ];
    expect(metaLegendIndexCountries(legends, events)).toEqual(["DE", "FR"]);
  });
});
