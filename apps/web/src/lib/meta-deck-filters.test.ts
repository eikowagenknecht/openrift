import type { MetaDeckSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { MetaDeckFilterValues } from "./meta-deck-filters";
import {
  curateMetaDecks,
  filterMetaDecks,
  hasActiveMetaDeckFilters,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  sortMetaDecks,
} from "./meta-deck-filters";
import type { MetaEra } from "./meta-scope";
import { ERA_CUSTOM } from "./meta-scope";

const ERAS: MetaEra[] = [
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
];

const EMPTY: MetaDeckFilterValues = {
  scope: {},
  eras: ERAS,
  events: [],
  legends: [],
  maxRank: null,
  buildable: false,
  showAll: false,
};

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
      tier: "store",
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

  it("filters by the scope's format", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, scope: { format: "legacy" } }))).toEqual(["c"]);
  });

  it("filters by the event's tier", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, scope: { tier: "premier" } }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("filters by country whatever case the code is stored in", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, scope: { country: "fr" } }))).toEqual(["c"]);
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
    expect(ids(filterMetaDecks(decks, { ...EMPTY, scope: { era: "origins" } }))).toEqual(["c"]);
    expect(ids(filterMetaDecks(decks, { ...EMPTY, scope: { era: "vendetta" } }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("treats both custom-range bounds as inclusive", () => {
    const exact = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { era: ERA_CUSTOM, from: "2026-06-15", to: "2026-06-15" },
    });
    expect(ids(exact)).toEqual(["c"]);
    const open = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { era: ERA_CUSTOM, from: "2026-07-01" },
    });
    expect(ids(open)).toEqual(["a", "b"]);
  });

  it("keeps only the decks the reader can mostly build when asked", () => {
    const result = filterMetaDecks(
      decks,
      { ...EMPTY, buildable: true },
      { buildableDeckIds: new Set(["b"]) },
    );
    expect(ids(result)).toEqual(["b"]);
  });

  it("keeps the whole archive while no collection has loaded, rather than emptying a shared link", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, buildable: true }))).toEqual(["a", "b", "c"]);
  });

  it("ignores the buildable set while the filter is off", () => {
    const result = filterMetaDecks(decks, EMPTY, { buildableDeckIds: new Set(["b"]) });
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("intersects across axes", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { format: "standard" },
      maxRank: 4,
      legends: ["card-lux"],
    });
    expect(ids(result)).toEqual(["b"]);
  });

  it("returns nothing when the axes cannot overlap", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      scope: { format: "legacy" },
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
          tier: "store",
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
    const shuffled = [decks[2], decks[1], decks[0]];
    expect(ids(sortMetaDecks(shuffled))).toEqual(["a", "b", "c"]);
  });

  it("breaks a rank tie on player name", () => {
    const tied = [
      makeDeck({ deckId: "z", playerName: "Zed", rank: 4 }),
      makeDeck({ deckId: "m", playerName: "Mel", rank: 4 }),
    ];
    expect(ids(sortMetaDecks(tied))).toEqual(["m", "z"]);
  });
});

describe("metaDeckFilterCounts", () => {
  it("counts every value when nothing is filtered", () => {
    const counts = metaDeckFilterCounts(decks, EMPTY);
    expect(counts.events.get("rift-open")).toBe(1);
    expect(counts.legends.get("card-jinx")).toBe(1);
    // Buckets are cumulative: a 1st place is inside Top 4 as well.
    expect(counts.finish.get(1)).toBe(1);
    expect(counts.finish.get(4)).toBe(2);
    expect(counts.finish.get(8)).toBe(3);
  });

  it("counts an axis with the other axes already applied", () => {
    const counts = metaDeckFilterCounts(decks, { ...EMPTY, scope: { format: "standard" } });
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
          tier: "casual",
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
    expect(hasActiveMetaDeckFilters(EMPTY)).toBe(false);
  });

  it("is true once any axis is populated", () => {
    expect(hasActiveMetaDeckFilters({ ...EMPTY, scope: { tier: "premier" } })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, maxRank: 8 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, buildable: true })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, events: ["rift-open"] })).toBe(true);
  });
});
