import type { MetaDeckSummary } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import type { MetaDeckFilterValues } from "./meta-deck-filters";
import {
  countMetaDecksUnderCost,
  curateMetaDecks,
  filterMetaDecks,
  hasActiveMetaDeckFilters,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  nextDeckSort,
  sortMetaDecks,
} from "./meta-deck-filters";
import type { MetaEra } from "./meta-scope";
import { ERA_ALL, ERA_CUSTOM } from "./meta-scope";

const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
];

const EMPTY: MetaDeckFilterValues = {
  scope: { era: ERA_ALL, formats: [], tiers: [] },
  eras: ERAS,
  events: [],
  legends: [],
  maxRank: null,
  maxCost: null,
  valueMin: null,
  valueMax: null,
  includeSideboard: false,
  showAll: false,
};

const COSTS = new Map([
  ["a", { needed: 40, owned: 40, value: 120, toComplete: 0 }],
  ["b", { needed: 40, owned: 20, value: 60, toComplete: 25 }],
  ["c", { needed: 40, owned: 0, value: undefined, toComplete: undefined }],
]);

function makeDeck(overrides: Partial<MetaDeckSummary> = {}): MetaDeckSummary {
  const event = {
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "standard",
    tier: "premier" as const,
    country: "DE",
    ...overrides.event,
  };
  return {
    playerId: "player-1",
    deckId: "deck-1",
    shareToken: "token000001",
    listStatus: "full",
    name: "Fury Aggro",
    format: event.format,
    legendCardId: "card-jinx",
    legendName: "Jinx, Loose Cannon",
    legendSlug: "jinx-loose-cannon",
    legendArchiveSlug: null,
    legendImageId: "img-jinx",
    championCardId: "card-jinx-champ",
    championName: "Jinx, Loose Cannon",
    championImageId: "img-jinx-champ",
    playerName: "Ashen",
    playerKey: "u6001",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: null,
    ...overrides,
    event,
  };
}

const decks: MetaDeckSummary[] = [
  makeDeck({ deckId: "a", playerName: "Ashen", rank: 1 }),
  makeDeck({
    deckId: "b",
    playerName: "Bram",
    rank: 4,
    legendCardId: "card-lux",
    legendName: "Lux",
  }),
  makeDeck({
    deckId: "c",
    playerName: "Cyra",
    rank: 8,
    legendCardId: null,
    legendName: null,
    event: {
      slug: "rift-open",
      name: "Rift Open",
      eventDate: "2026-06-15",
      format: "legacy",
      tier: "local",
      country: "FR",
    },
  }),
];

const ids = (result: MetaDeckSummary[]) => result.map((deck) => deck.deckId);
const curated = (list: readonly MetaDeckSummary[]) => curateMetaDecks(list, { showAll: false });

describe("filterMetaDecks", () => {
  it("keeps everything when no axis is set", () => {
    expect(ids(filterMetaDecks(decks, EMPTY))).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for an empty archive", () => {
    expect(filterMetaDecks([], EMPTY)).toEqual([]);
  });

  it("opens on premier and competitive events while the URL names no tier", () => {
    const untouched = { ...EMPTY, scope: { era: ERA_ALL, formats: [] } };
    expect(ids(filterMetaDecks(decks, untouched))).toEqual(["a", "b"]);
  });

  it("lists every tier once the tier facet is emptied by hand", () => {
    expect(ids(filterMetaDecks(decks, EMPTY))).toEqual(["a", "b", "c"]);
  });

  it("filters by the scope's format", () => {
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, scope: { ...EMPTY.scope, formats: ["legacy"] } })),
    ).toEqual(["c"]);
  });

  it("filters by the event's tier", () => {
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, scope: { ...EMPTY.scope, tiers: ["premier"] } })),
    ).toEqual(["a", "b"]);
  });

  it("filters by country whatever case the code is stored in", () => {
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, scope: { ...EMPTY.scope, countries: ["fr"] } })),
    ).toEqual(["c"]);
  });

  it("filters by event slug", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, events: ["rift-open"] });
    expect(ids(result)).toEqual(["c"]);
  });

  it("filters by legend and drops decks with no legend", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, legends: ["card-jinx"] });
    expect(ids(result)).toEqual(["a"]);
  });

  it("treats several values on one axis as a union", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, legends: ["card-jinx", "card-lux"] });
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("treats the finish bound as inclusive", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, maxRank: 4 }))).toEqual(["a", "b"]);
    expect(ids(filterMetaDecks(decks, { ...EMPTY, maxRank: 1 }))).toEqual(["a"]);
  });

  it("resolves a set era to its own window", () => {
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, scope: { ...EMPTY.scope, era: "origins" } })),
    ).toEqual(["c"]);
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, scope: { ...EMPTY.scope, era: "vendetta" } })),
    ).toEqual(["a", "b"]);
  });

  it("treats both custom-range bounds as inclusive", () => {
    const exact = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { ...EMPTY.scope, era: ERA_CUSTOM, from: "2026-06-15", to: "2026-06-15" },
    });
    expect(ids(exact)).toEqual(["c"]);
    const open = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { ...EMPTY.scope, era: ERA_CUSTOM, from: "2026-07-01" },
    });
    expect(ids(open)).toEqual(["a", "b"]);
  });

  it("keeps only the lists completable within the cost bound", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, maxCost: 25 }, { costs: COSTS });
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("treats a bound of zero as the lists the reader can build now", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, maxCost: 0 }, { costs: COSTS });
    expect(ids(result)).toEqual(["a"]);
  });

  it("drops a list whose completion cannot be costed", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, maxCost: 1000 }, { costs: COSTS });
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("keeps the whole archive while no costs have loaded, rather than emptying a shared link", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, maxCost: 0 }))).toEqual(["a", "b", "c"]);
  });

  it("ignores the costs while no bound is set", () => {
    expect(ids(filterMetaDecks(decks, EMPTY, { costs: COSTS }))).toEqual(["a", "b", "c"]);
  });

  it("treats both value bounds as inclusive", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, valueMin: 60 }, { costs: COSTS }))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(filterMetaDecks(decks, { ...EMPTY, valueMax: 60 }, { costs: COSTS }))).toEqual([
      "b",
    ]);
    expect(
      ids(filterMetaDecks(decks, { ...EMPTY, valueMin: 61, valueMax: 200 }, { costs: COSTS })),
    ).toEqual(["a"]);
  });

  it("drops a list whose value is unknown once a bound is set", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, valueMin: 0 }, { costs: COSTS }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps the whole archive on a value bound while no costs have loaded", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, valueMax: 1 }))).toEqual(["a", "b", "c"]);
  });

  it("intersects across axes", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { ...EMPTY.scope, formats: ["standard"] },
      maxRank: 4,
      legends: ["card-lux"],
    });
    expect(ids(result)).toEqual(["b"]);
  });

  it("returns nothing when the axes cannot overlap", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { ...EMPTY.scope, formats: ["legacy"] },
      maxRank: 1,
    });
    expect(result).toEqual([]);
  });
});

describe("curateMetaDecks", () => {
  it("leaves the list alone once the reader has opened the full archive", () => {
    const sameLegend = [
      makeDeck({ deckId: "worse", playerName: "Bram", rank: 8 }),
      makeDeck({ deckId: "better", playerName: "Ashen", rank: 2 }),
    ];
    expect(ids(curateMetaDecks(sameLegend, { showAll: true }))).toEqual(["worse", "better"]);
  });

  it("keeps one deck per legend per event, the best finish", () => {
    const sameLegend = [
      makeDeck({ deckId: "worse", playerName: "Bram", rank: 8 }),
      makeDeck({ deckId: "better", playerName: "Ashen", rank: 2 }),
    ];
    expect(ids(curated(sameLegend))).toEqual(["better"]);
  });

  it("keeps the same legend once per event it appeared at", () => {
    const twoEvents = [
      makeDeck({ deckId: "here", rank: 4 }),
      makeDeck({
        deckId: "there",
        rank: 4,
        event: {
          slug: "rift-open",
          name: "Rift Open",
          eventDate: "2026-06-15",
          format: "standard",
          tier: "local",
          country: "FR",
        },
      }),
    ];
    expect(ids(curated(twoEvents)).toSorted()).toEqual(["here", "there"]);
  });

  it("breaks a tied finish on player name, so the tile does not flip between renders", () => {
    const tied = [
      makeDeck({ deckId: "zed", playerName: "Zed", rank: 4 }),
      makeDeck({ deckId: "mel", playerName: "Mel", rank: 4 }),
    ];
    expect(ids(curated(tied))).toEqual(["mel"]);
    expect(ids(curated(tied.toReversed()))).toEqual(["mel"]);
  });

  it("never folds two unknown legends together", () => {
    const unknown = [
      makeDeck({ deckId: "one", legendCardId: null, rank: 4 }),
      makeDeck({ deckId: "two", legendCardId: null, rank: 8 }),
    ];
    expect(ids(curated(unknown)).toSorted()).toEqual(["one", "two"]);
  });

  it("returns nothing for an empty list", () => {
    expect(curated([])).toEqual([]);
  });
});

describe("sortMetaDecks", () => {
  it("orders by event date desc, then finish, then player", () => {
    const shuffled = [decks[2]!, decks[1]!, decks[0]!];
    expect(ids(sortMetaDecks(shuffled))).toEqual(["a", "b", "c"]);
  });

  it("keeps same-day events together", () => {
    const sameDay = { ...decks[0]!.event, slug: "rift-open", name: "Rift Open" };
    const interleaved = [
      makeDeck({ deckId: "s1", rank: 1 }),
      makeDeck({ deckId: "r1", rank: 1, event: sameDay }),
      makeDeck({ deckId: "s2", rank: 2 }),
      makeDeck({ deckId: "r2", rank: 2, event: sameDay }),
    ];
    expect(ids(sortMetaDecks(interleaved))).toEqual(["r1", "r2", "s1", "s2"]);
  });

  it("breaks a rank tie on player name", () => {
    const tied = [
      makeDeck({ deckId: "z", playerName: "Zed", rank: 4 }),
      makeDeck({ deckId: "m", playerName: "Mel", rank: 4 }),
    ];
    expect(ids(sortMetaDecks(tied))).toEqual(["m", "z"]);
  });

  it("runs the dates the other way when asked", () => {
    expect(ids(sortMetaDecks(decks, "date", "asc"))).toEqual(["c", "a", "b"]);
  });

  it("orders by finish across events, newest first on a tie", () => {
    const rows = [
      makeDeck({ deckId: "old-1", rank: 1, event: decks[2]!.event }),
      makeDeck({ deckId: "new-4", rank: 4 }),
      makeDeck({ deckId: "new-1", rank: 1 }),
    ];
    expect(ids(sortMetaDecks(rows, "finish", "asc"))).toEqual(["new-1", "old-1", "new-4"]);
    expect(ids(sortMetaDecks(rows, "finish", "desc"))).toEqual(["new-4", "new-1", "old-1"]);
  });

  it("orders by cost to complete with unpriced lists last either way", () => {
    expect(ids(sortMetaDecks(decks, "cost", "asc", COSTS))).toEqual(["a", "b", "c"]);
    expect(ids(sortMetaDecks(decks, "cost", "desc", COSTS))).toEqual(["b", "a", "c"]);
  });

  it("orders by value with unpriced lists last either way", () => {
    expect(ids(sortMetaDecks(decks, "value", "asc", COSTS))).toEqual(["b", "a", "c"]);
    expect(ids(sortMetaDecks(decks, "value", "desc", COSTS))).toEqual(["a", "b", "c"]);
  });

  it("falls back to the date order before any cost is known", () => {
    expect(ids(sortMetaDecks(decks, "cost", "asc"))).toEqual(["a", "b", "c"]);
  });
});

describe("nextDeckSort", () => {
  it("flips the direction of the column already sorted by", () => {
    expect(nextDeckSort({ sort: "date", direction: "desc" }, "date")).toEqual({
      sort: "date",
      direction: "asc",
    });
  });

  it("opens a new column on newest, best or cheapest first", () => {
    expect(nextDeckSort({ sort: "finish", direction: "asc" }, "date")).toEqual({
      sort: "date",
      direction: "desc",
    });
    expect(nextDeckSort({ sort: "date", direction: "desc" }, "cost")).toEqual({
      sort: "cost",
      direction: "asc",
    });
  });
});

describe("metaDeckFilterCounts", () => {
  it("counts every value when nothing is filtered, finish buckets cumulative", () => {
    const counts = metaDeckFilterCounts(decks, EMPTY);
    expect(counts.events.get("rift-open")).toBe(1);
    expect(counts.legends.get("card-jinx")).toBe(1);
    expect(counts.finish.get(1)).toBe(1);
    expect(counts.finish.get(4)).toBe(2);
    expect(counts.finish.get(8)).toBe(3);
  });

  it("counts an axis with the other axes already applied", () => {
    const counts = metaDeckFilterCounts(decks, {
      ...EMPTY,
      scope: { ...EMPTY.scope, formats: ["standard"] },
    });
    expect(counts.events.get("rift-open")).toBeUndefined();
    expect(counts.finish.get(8)).toBe(2);
  });

  it("counts an axis without applying itself", () => {
    const counts = metaDeckFilterCounts(decks, { ...EMPTY, legends: ["card-jinx"] });
    expect(counts.legends.get("card-lux")).toBe(1);
  });

  it("counts what the curated grid will render, not the raw matches", () => {
    const sameLegendTwice = [
      makeDeck({ deckId: "winner", playerName: "Ashen", rank: 1 }),
      makeDeck({ deckId: "eighth", playerName: "Bram", rank: 8 }),
    ];
    expect(metaDeckFilterCounts(sameLegendTwice, EMPTY).legends.get("card-jinx")).toBe(1);
    expect(
      metaDeckFilterCounts(sameLegendTwice, { ...EMPTY, showAll: true }).legends.get("card-jinx"),
    ).toBe(2);
  });
});

describe("metaDeckFilterOptions", () => {
  it("derives the distinct values present in the archive", () => {
    const options = metaDeckFilterOptions(decks);
    expect(options.events).toEqual([
      { value: "summoner-skirmish", label: "Summoner Skirmish" },
      { value: "rift-open", label: "Rift Open" },
    ]);
    expect(options.legends).toEqual([
      { value: "card-jinx", label: "Jinx, Loose Cannon" },
      { value: "card-lux", label: "Lux" },
    ]);
    expect(options.countries).toEqual(["DE", "FR"]);
  });

  it("leaves out a country no source recorded", () => {
    const options = metaDeckFilterOptions([
      makeDeck({
        event: {
          slug: "unknown-venue",
          name: "Unknown Venue",
          eventDate: "2026-08-01",
          format: "standard",
          tier: "local",
          country: null,
        },
      }),
    ]);
    expect(options.countries).toEqual([]);
  });

  it("returns empty lists for an empty archive", () => {
    expect(metaDeckFilterOptions([])).toEqual({ events: [], legends: [], countries: [] });
  });
});

describe("hasActiveMetaDeckFilters", () => {
  it("is false for the default state", () => {
    expect(hasActiveMetaDeckFilters({ ...EMPTY, scope: {} })).toBe(false);
  });

  it("is true once the reader opens the scope past its default", () => {
    expect(hasActiveMetaDeckFilters(EMPTY)).toBe(true);
  });

  it("is true once any axis is populated", () => {
    expect(
      hasActiveMetaDeckFilters({ ...EMPTY, scope: { ...EMPTY.scope, tiers: ["premier"] } }),
    ).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, maxRank: 8 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, maxCost: 0 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, valueMin: 5 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, valueMax: 5 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, events: ["rift-open"] })).toBe(true);
  });
});

describe("countMetaDecksUnderCost", () => {
  it("counts what the grid would show at another bound", () => {
    expect(countMetaDecksUnderCost(decks, { ...EMPTY, showAll: true }, { costs: COSTS }, 0)).toBe(
      1,
    );
    expect(countMetaDecksUnderCost(decks, { ...EMPTY, showAll: true }, { costs: COSTS }, 25)).toBe(
      2,
    );
  });

  it("holds the other axes as they are", () => {
    const filters = { ...EMPTY, showAll: true, legends: ["card-jinx"] };
    expect(countMetaDecksUnderCost(decks, filters, { costs: COSTS }, 25)).toBe(1);
  });

  it("counts the curated grid rather than the raw matches", () => {
    const sameLegendTwice = [
      makeDeck({ deckId: "a", playerName: "Ashen", rank: 1 }),
      makeDeck({ deckId: "b", playerName: "Bram", rank: 8 }),
    ];
    expect(countMetaDecksUnderCost(sameLegendTwice, EMPTY, { costs: COSTS }, 25)).toBe(1);
  });

  it("counts the whole curated archive for a lifted bound", () => {
    expect(
      countMetaDecksUnderCost(decks, { ...EMPTY, showAll: true }, { costs: COSTS }, null),
    ).toBe(3);
  });
});
