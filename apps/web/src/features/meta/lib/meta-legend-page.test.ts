import type { MetaLegendEventRecord } from "@openrift/shared/contracts/meta";
import type {
  MetaEventSummary,
  MetaLegendFinish,
  MetaLegendSummary,
} from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import {
  metaLegendCountries,
  metaLegendIndexCountries,
  metaLegendIndexEntries,
  metaScopedCountries,
  nextLegendSort,
  sortMetaLegendEntries,
} from "@/features/meta/lib/meta-legend-page";
import type { MetaEra } from "@/features/meta/lib/meta-scope";
import { ERA_ALL } from "@/features/meta/lib/meta-scope";

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
    playerKey: "u5001",
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
      tier: "local",
      country: "DE",
      playerCount: 64,
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
    tier: "local",
    status: "complete",
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

describe("metaLegendCountries", () => {
  it("offers each country the record covers once, alphabetically", () => {
    expect(
      metaLegendCountries([
        finish({ playerId: "a", event: { country: "it" } }),
        finish({ playerId: "b", event: { country: "AT" } }),
        finish({ playerId: "c", event: { country: "IT" } }),
      ]),
    ).toEqual(["AT", "IT"]);
  });

  it("offers nothing for events no source gave a venue", () => {
    expect(
      metaLegendCountries([
        finish({ playerId: "a", event: { country: null } }),
        finish({ playerId: "b", event: { country: "??" } }),
      ]),
    ).toEqual([]);
  });

  it("offers nothing for an empty record", () => {
    expect(metaLegendCountries([])).toEqual([]);
  });
});

describe("metaScopedCountries", () => {
  it("offers the countries the rows on screen name", () => {
    expect(
      metaScopedCountries([finish({ event: { country: "FR" } })], { era: ERA_ALL, formats: [] }),
    ).toEqual(["FR"]);
  });

  it("still offers a country the scope picked, so the reader can pick it back off", () => {
    expect(
      metaScopedCountries([finish({ event: { country: "FR" } })], { countries: ["fr", "jp"] }),
    ).toEqual(["FR", "JP"]);
  });

  it("offers an excluded country too", () => {
    expect(metaScopedCountries([], { countriesEx: ["DE"] })).toEqual(["DE"]);
  });

  it("offers nothing when neither the rows nor the scope name a country", () => {
    expect(metaScopedCountries([], {})).toEqual([]);
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
    eventSummary("skirmish", { eventDate: "2026-08-15", tier: "local" }),
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
    expect(entries[0]!.bestFinish.event.slug).toBe("skirmish");
  });

  it("recomputes the facts inside the scope", () => {
    const entries = metaLegendIndexEntries([kennen], events, {
      scope: { era: ERA_ALL, formats: [], tiers: ["competitive"] },
      eras: ERAS,
    });
    expect(entries[0]).toMatchObject({ finishes: 3, decklists: 2 });
    expect(entries[0]!.bestFinish.event.slug).toBe("regional-lyon");
  });

  it("drops a legend with no finish in scope", () => {
    const entries = metaLegendIndexEntries([kennen, azir], events, {
      scope: { era: ERA_ALL, formats: [], tiers: ["local"] },
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
    expect(sortMetaLegendEntries(entries, "decklists", "desc")[0]!.slug).toBe("azir");
    expect(sortMetaLegendEntries(entries, "finishes", "desc")[0]!.slug).toBe("kennen");
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
