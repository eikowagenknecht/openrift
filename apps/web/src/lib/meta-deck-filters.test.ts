import type { MetaDeckSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { MetaDeckFilterValues } from "./meta-deck-filters";
import {
  filterMetaDecks,
  hasActiveMetaDeckFilters,
  metaDeckFilterCounts,
  metaDeckFilterOptions,
  sortMetaDecks,
} from "./meta-deck-filters";

const EMPTY: MetaDeckFilterValues = {
  formats: [],
  events: [],
  legends: [],
  maxRank: null,
  dateFrom: null,
  dateTo: null,
};

function makeDeck(overrides: Partial<MetaDeckSummary> = {}): MetaDeckSummary {
  const event = {
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "standard",
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
    },
  }),
];

const ids = (result: MetaDeckSummary[]) => result.map((deck) => deck.deckId);

describe("filterMetaDecks", () => {
  it("keeps everything when no axis is set", () => {
    expect(ids(filterMetaDecks(decks, EMPTY))).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for an empty archive", () => {
    expect(filterMetaDecks([], EMPTY)).toEqual([]);
  });

  it("filters by format", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, formats: ["legacy"] });
    expect(ids(result)).toEqual(["c"]);
  });

  it("treats several values on one axis as a union", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      formats: ["legacy", "standard"],
    });
    expect(ids(result)).toEqual(["a", "b", "c"]);
  });

  it("filters by event slug", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, events: ["rift-open"] });
    expect(ids(result)).toEqual(["c"]);
  });

  it("filters by legend and drops decks with no legend", () => {
    const result = filterMetaDecks(decks, { ...EMPTY, legends: ["card-jinx"] });
    expect(ids(result)).toEqual(["a"]);
  });

  it("treats the finish bound as inclusive", () => {
    expect(ids(filterMetaDecks(decks, { ...EMPTY, maxRank: 4 }))).toEqual(["a", "b"]);
    expect(ids(filterMetaDecks(decks, { ...EMPTY, maxRank: 1 }))).toEqual(["a"]);
  });

  it("treats both date bounds as inclusive", () => {
    const exact = filterMetaDecks(decks, {
      ...EMPTY,
      dateFrom: "2026-06-15",
      dateTo: "2026-06-15",
    });
    expect(ids(exact)).toEqual(["c"]);
    const open = filterMetaDecks(decks, { ...EMPTY, dateFrom: "2026-07-01" });
    expect(ids(open)).toEqual(["a", "b"]);
  });

  it("intersects across axes", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      formats: ["standard"],
      maxRank: 4,
      legends: ["card-lux"],
    });
    expect(ids(result)).toEqual(["b"]);
  });

  it("returns nothing when the axes cannot overlap", () => {
    const result = filterMetaDecks(decks, {
      ...EMPTY,
      formats: ["legacy"],
      maxRank: 1,
    });
    expect(result).toEqual([]);
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
    expect(counts.formats.get("standard")).toBe(2);
    expect(counts.formats.get("legacy")).toBe(1);
    expect(counts.events.get("rift-open")).toBe(1);
    expect(counts.legends.get("card-jinx")).toBe(1);
    // Buckets are cumulative: a 1st place is inside Top 4 as well.
    expect(counts.finish.get(1)).toBe(1);
    expect(counts.finish.get(4)).toBe(2);
    expect(counts.finish.get(8)).toBe(3);
  });

  it("counts an axis with the other axes already applied", () => {
    const counts = metaDeckFilterCounts(decks, {
      ...EMPTY,
      formats: ["standard"],
    });
    // The legacy event is filtered out of every other axis...
    expect(counts.events.get("rift-open")).toBeUndefined();
    expect(counts.finish.get(8)).toBe(2);
    // ...but the format axis still counts itself unfiltered, so picking a
    // different format shows what it would yield.
    expect(counts.formats.get("legacy")).toBe(1);
  });
});

describe("metaDeckFilterOptions", () => {
  it("derives the distinct values present in the archive", () => {
    const options = metaDeckFilterOptions(decks);
    expect(options.formats).toEqual(["legacy", "standard"]);
    expect(options.events).toEqual([
      { value: "summoner-skirmish", label: "Summoner Skirmish" },
      { value: "rift-open", label: "Rift Open" },
    ]);
    expect(options.legends).toEqual([
      { value: "card-jinx", label: "Jinx, Loose Cannon" },
      { value: "card-lux", label: "Lux" },
    ]);
  });

  it("returns empty lists for an empty archive", () => {
    expect(metaDeckFilterOptions([])).toEqual({ formats: [], events: [], legends: [] });
  });
});

describe("hasActiveMetaDeckFilters", () => {
  it("is false for the default state", () => {
    expect(hasActiveMetaDeckFilters(EMPTY)).toBe(false);
  });

  it("is true once any axis is populated", () => {
    expect(hasActiveMetaDeckFilters({ ...EMPTY, formats: ["standard"] })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, maxRank: 8 })).toBe(true);
    expect(hasActiveMetaDeckFilters({ ...EMPTY, dateTo: "2026-01-01" })).toBe(true);
  });
});
