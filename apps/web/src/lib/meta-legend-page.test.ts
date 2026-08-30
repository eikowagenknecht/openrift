import type { MetaDeckSummary, MetaLegendFinish, MetaLegendSummary } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  filterLegendDecks,
  filterLegendFinishes,
  filterLegends,
  metaLegendCounts,
  metaLegendCountries,
  metaLegendDecks,
  sortLegendFinishes,
} from "@/lib/meta-legend-page";
import type { MetaEra } from "@/lib/meta-scope";

const ERAS: MetaEra[] = [
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
];

const ALL_TIME = { scope: {}, eras: ERAS };

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

function legendSummary(name: string, slug: string, deckCount = 0): MetaLegendSummary {
  return {
    slug,
    legend: { cardId: slug, name, slug, imageId: null, domains: [], archiveSlug: slug },
    deckCount,
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
      filterLegendDecks(decks, { scope: { tier: "premier" }, eras: ERAS }).map(
        (entry) => entry.deckId,
      ),
    ).toEqual(["a"]);
    expect(
      filterLegendDecks(decks, { scope: { country: "de" }, eras: ERAS }).map(
        (entry) => entry.deckId,
      ),
    ).toEqual(["b"]);
    expect(filterLegendDecks(decks, { scope: { format: "limited" }, eras: ERAS })).toEqual([]);
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
      filterLegendFinishes([premier, store], { scope: { tier: "premier" }, eras: ERAS }).map(
        (entry) => entry.playerId,
      ),
    ).toEqual(["p1"]);
    expect(
      filterLegendFinishes([premier, store], { scope: { country: "fr" }, eras: ERAS }).map(
        (entry) => entry.playerId,
      ),
    ).toEqual(["p1"]);
    expect(
      filterLegendFinishes([premier, store], { scope: { format: "draft" }, eras: ERAS }),
    ).toEqual([]);
  });

  it("treats an era the set list no longer knows as no narrowing", () => {
    expect(
      filterLegendFinishes([premier, store], { scope: { era: "retired-set" }, eras: ERAS }),
    ).toHaveLength(2);
  });

  it("leaves the caller's array alone and handles an empty record", () => {
    const input = [premier, store];
    filterLegendFinishes(input, { scope: { tier: "premier" }, eras: ERAS });
    expect(input).toHaveLength(2);
    expect(filterLegendFinishes([], { scope: { tier: "premier" }, eras: ERAS })).toEqual([]);
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

describe("filterLegends", () => {
  const kennen = legendSummary("Kennen, Heart of the Tempest", "kennen-heart-of-the-tempest", 3);
  const azir = legendSummary("Azir, Emperor of the Sands", "azir-emperor-of-the-sands");

  it("files legends under the name a reader sees", () => {
    expect(filterLegends([kennen, azir], undefined).map((entry) => entry.slug)).toEqual([
      "azir-emperor-of-the-sands",
      "kennen-heart-of-the-tempest",
    ]);
  });

  it("matches the epithet as well as the champion", () => {
    expect(filterLegends([kennen, azir], "tempest")).toEqual([kennen]);
    expect(filterLegends([kennen, azir], "azir")).toEqual([azir]);
  });

  it("ignores case and surrounding space", () => {
    expect(filterLegends([kennen, azir], "  KENNEN ")).toEqual([kennen]);
  });

  it("treats a blank query as no query", () => {
    expect(filterLegends([kennen, azir], "   ")).toHaveLength(2);
  });

  it("returns nothing when no legend matches", () => {
    expect(filterLegends([kennen, azir], "teemo")).toEqual([]);
  });
});
