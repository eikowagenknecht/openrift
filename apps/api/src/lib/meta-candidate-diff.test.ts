import { describe, expect, it } from "vitest";

import type {
  MetaDeckCardEntry,
  MetaEventFields,
  MetaPlayerFields,
} from "./meta-candidate-diff.js";
import {
  collapseCardEntries,
  diffMetaDeckCards,
  diffMetaEvent,
  diffMetaPlayer,
  hasCardDiff,
  hasPlayerDiff,
  metaCandidateState,
  normalize,
  metaDeckCardEntries,
  resolveMetaPlayerCards,
} from "./meta-candidate-diff.js";

const AZIR = "11111111-0000-7000-8000-000000000001";
const YASUO = "11111111-0000-7000-8000-000000000002";
const SHOCK = "11111111-0000-7000-8000-000000000003";
const VI = "11111111-0000-7000-8000-000000000004";

function event(overrides: Partial<MetaEventFields> = {}): MetaEventFields {
  return {
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: "Top 8 lists only.",
    tier: "store",
    country: "DE",
    location: "Kartenstraße 1, 10115 Berlin, DE",
    ...overrides,
  };
}

function card(cardId: string, overrides: Partial<MetaDeckCardEntry> = {}): MetaDeckCardEntry {
  return { cardId, zone: "main", quantity: 1, ...overrides };
}

type PlayerWithCards = MetaPlayerFields & { cards: MetaDeckCardEntry[] };

function player(overrides: Partial<PlayerWithCards> = {}): PlayerWithCards {
  return {
    event: "live-1",
    playerName: "Renata",
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: AZIR,
    championCardId: null,
    listStatus: "full",
    cards: [card(AZIR, { zone: "legend" })],
    ...overrides,
  };
}

describe("normalize", () => {
  it("folds every way of saying nothing onto null", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeNull();
    expect(normalize("")).toBeNull();
    expect(normalize("   ")).toBeNull();
    expect(normalize("\n\t ")).toBeNull();
  });

  it("passes real values through untouched", () => {
    expect(normalize("LGS Berlin")).toBe("LGS Berlin");
    expect(normalize(" padded ")).toBe(" padded ");
    expect(normalize(0)).toBe(0);
    expect(normalize(64)).toBe(64);
    expect(normalize(false)).toBe(false);
  });
});

describe("diffMetaEvent", () => {
  it("reports nothing for identical events", () => {
    expect(diffMetaEvent(event(), event())).toEqual([]);
  });

  it("reports each disagreeing field with both values", () => {
    const diff = diffMetaEvent(event(), event({ name: "Skirmish Berlin", playerCount: 72 }));
    expect(diff).toEqual([
      { field: "name", from: "Summoner Skirmish Berlin", to: "Skirmish Berlin" },
      { field: "playerCount", from: 64, to: 72 },
    ]);
  });

  it("treats an empty string and null as the same absence", () => {
    const live = event({ organizer: null, notes: null });
    const candidate = event({ organizer: "", notes: "" });
    expect(diffMetaEvent(live, candidate)).toEqual([]);
  });

  it("treats a whitespace-only string as absent too", () => {
    const live = event({ organizer: null, notes: null });
    const candidate = event({ organizer: "   ", notes: "\n\t" });
    expect(diffMetaEvent(live, candidate)).toEqual([]);
  });

  it("keeps the spacing of a string that is not blank", () => {
    expect(diffMetaEvent(event(), event({ organizer: " LGS Berlin " }))).toEqual([
      { field: "organizer", from: "LGS Berlin", to: " LGS Berlin " },
    ]);
  });

  it("reports a field going from a value to absent", () => {
    expect(diffMetaEvent(event(), event({ organizer: null }))).toEqual([
      { field: "organizer", from: "LGS Berlin", to: null },
    ]);
  });

  it("reports a date change", () => {
    expect(diffMetaEvent(event(), event({ eventDate: "2026-08-02" }))).toEqual([
      { field: "eventDate", from: "2026-08-01", to: "2026-08-02" },
    ]);
  });

  it("reports tier, country, and address disagreements like any field", () => {
    const diff = diffMetaEvent(
      event(),
      event({ tier: "competitive", country: "AT", location: "Hauptplatz 1, Graz, AT" }),
    );
    expect(diff.map((entry) => entry.field)).toEqual(["tier", "country", "location"]);
  });

  it("stays silent on tier, country, and address a source holds nothing for", () => {
    const candidate = event({ tier: null, country: null, location: null });
    expect(diffMetaEvent(event(), candidate)).toEqual([]);
  });
});

describe("collapseCardEntries", () => {
  it("leaves a list with no duplicates alone", () => {
    const entries = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    expect(collapseCardEntries(entries)).toEqual(entries);
  });

  it("sums rows that landed on the same card and zone", () => {
    const entries = [card(SHOCK, { quantity: 2 }), card(AZIR), card(SHOCK, { quantity: 1 })];
    expect(collapseCardEntries(entries)).toEqual([card(SHOCK, { quantity: 3 }), card(AZIR)]);
  });

  it("keeps the same card in two zones apart", () => {
    const entries = [card(SHOCK, { quantity: 3 }), card(SHOCK, { zone: "sideboard" })];
    expect(collapseCardEntries(entries)).toEqual(entries);
  });

  it("does not mutate its input", () => {
    const entries = [card(SHOCK, { quantity: 2 }), card(SHOCK, { quantity: 1 })];
    collapseCardEntries(entries);
    expect(entries[0].quantity).toBe(2);
  });

  it("returns nothing for an empty list", () => {
    expect(collapseCardEntries([])).toEqual([]);
  });
});

describe("diffMetaDeckCards", () => {
  it("reports nothing for identical lists regardless of order", () => {
    const live = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    const candidate = [card(SHOCK, { quantity: 3 }), card(AZIR, { zone: "legend" })];
    expect(diffMetaDeckCards(live, candidate)).toEqual({ added: [], removed: [], changed: [] });
  });

  it("reports added, removed and re-quantified cards", () => {
    const live = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    const candidate = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 2 }), card(YASUO)];
    const diff = diffMetaDeckCards(live, candidate);
    expect(diff.added).toEqual([card(YASUO)]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([{ cardId: SHOCK, zone: "main", from: 3, to: 2 }]);
  });

  it("reports a card the candidate dropped", () => {
    const diff = diffMetaDeckCards([card(AZIR), card(YASUO)], [card(AZIR)]);
    expect(diff.removed).toEqual([card(YASUO)]);
    expect(diff.added).toEqual([]);
  });

  it("keys on card and zone, so the same card in two zones is two rows", () => {
    const live = [card(SHOCK, { quantity: 3 }), card(SHOCK, { zone: "sideboard", quantity: 1 })];
    const candidate = [
      card(SHOCK, { quantity: 3 }),
      card(SHOCK, { zone: "sideboard", quantity: 2 }),
    ];
    const diff = diffMetaDeckCards(live, candidate);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([{ cardId: SHOCK, zone: "sideboard", from: 1, to: 2 }]);
  });

  it("treats a card moved between zones as a removal plus an addition", () => {
    const diff = diffMetaDeckCards([card(SHOCK)], [card(SHOCK, { zone: "sideboard" })]);
    expect(diff.added).toEqual([card(SHOCK, { zone: "sideboard" })]);
    expect(diff.removed).toEqual([card(SHOCK)]);
    expect(diff.changed).toEqual([]);
  });

  it("reports an empty live list as all additions", () => {
    expect(diffMetaDeckCards([], [card(AZIR)]).added).toEqual([card(AZIR)]);
  });

  it("reports an empty candidate list as all removals", () => {
    expect(diffMetaDeckCards([card(AZIR)], []).removed).toEqual([card(AZIR)]);
  });
});

describe("diffMetaPlayer", () => {
  it("reports nothing for an identical standings row", () => {
    expect(hasPlayerDiff(diffMetaPlayer(player(), player()))).toBe(false);
  });

  it("reports a metadata change alone", () => {
    const diff = diffMetaPlayer(player(), player({ rank: 4 }));
    expect(diff.fields).toEqual([{ field: "rank", from: 1, to: 4 }]);
    expect(hasCardDiff(diff.cards)).toBe(false);
    expect(hasPlayerDiff(diff)).toBe(true);
  });

  it("reports a card change alone", () => {
    const live = player();
    const diff = diffMetaPlayer(live, player({ cards: [...live.cards, card(SHOCK)] }));
    expect(diff.fields).toEqual([]);
    expect(hasCardDiff(diff.cards)).toBe(true);
    expect(hasPlayerDiff(diff)).toBe(true);
  });

  it("reports a cut bucket and the same exact standing as different", () => {
    const diff = diffMetaPlayer(player({ rank: 8 }), player({ rank: 8, rankIsTier: true }));
    expect(diff.fields).toEqual([{ field: "rankIsTier", from: false, to: true }]);
    expect(hasPlayerDiff(diff)).toBe(true);
  });

  it("reports each part of the record the sources disagree on", () => {
    const diff = diffMetaPlayer(player(), player({ wins: 4, draws: 1 }));
    expect(diff.fields).toEqual([
      { field: "wins", from: 5, to: 4 },
      { field: "draws", from: 0, to: 1 },
    ]);
  });

  it("keeps a zero in the record apart from an unknown one", () => {
    const diff = diffMetaPlayer(player({ draws: null }), player({ draws: 0 }));
    expect(diff.fields).toEqual([{ field: "draws", from: null, to: 0 }]);
  });

  it("reports a legend the source disagrees on", () => {
    const diff = diffMetaPlayer(player(), player({ legendCardId: YASUO }));
    expect(diff.fields).toEqual([{ field: "legendCardId", from: AZIR, to: YASUO }]);
  });

  it("reports a champion arriving where the archive knew none", () => {
    const diff = diffMetaPlayer(player(), player({ championCardId: VI }));
    expect(diff.fields).toEqual([{ field: "championCardId", from: null, to: VI }]);
  });

  it("reports a row that moved to another event", () => {
    const diff = diffMetaPlayer(player(), player({ event: "live-2" }));
    expect(diff.fields).toEqual([{ field: "event", from: "live-1", to: "live-2" }]);
    expect(hasPlayerDiff(diff)).toBe(true);
  });

  it("reports a row whose candidate no longer points at any event", () => {
    const diff = diffMetaPlayer(player(), player({ event: null }));
    expect(diff.fields).toEqual([{ field: "event", from: "live-1", to: null }]);
  });

  it("reports a source that published a list for a standings-only entry", () => {
    const standingsOnly = player({ listStatus: "none" });
    const diff = diffMetaPlayer(standingsOnly, player({ cards: standingsOnly.cards }));
    expect(diff.fields).toEqual([{ field: "listStatus", from: "none", to: "full" }]);
    expect(hasPlayerDiff(diff)).toBe(true);
  });

  it("reports a partial list being completed, which changes no page", () => {
    const partial = player({ listStatus: "partial" });
    const diff = diffMetaPlayer(partial, player({ cards: partial.cards }));
    expect(diff.fields).toEqual([{ field: "listStatus", from: "partial", to: "full" }]);
  });

  it("reports nothing for two standings-only rows that agree", () => {
    const standingsOnly = player({ listStatus: "none", cards: [] });
    expect(hasPlayerDiff(diffMetaPlayer(standingsOnly, standingsOnly))).toBe(false);
  });
});

describe("resolveMetaPlayerCards", () => {
  it("takes the list's own zones when a list landed", () => {
    expect(
      resolveMetaPlayerCards({
        cards: [
          { zone: "legend", cardId: AZIR },
          { zone: "champion", cardId: VI },
          { zone: "main", cardId: SHOCK },
        ],
        legendCardId: YASUO,
        championCardId: null,
      }),
    ).toEqual({ legendCardId: AZIR, championCardId: VI });
  });

  it("takes the source's own picks for a standings-only row", () => {
    expect(
      resolveMetaPlayerCards({ cards: null, legendCardId: YASUO, championCardId: VI }),
    ).toEqual({ legendCardId: YASUO, championCardId: VI });
  });

  it("falls back per zone when the list fills only one of them", () => {
    expect(
      resolveMetaPlayerCards({
        cards: [{ zone: "legend", cardId: AZIR }],
        legendCardId: YASUO,
        championCardId: VI,
      }),
    ).toEqual({ legendCardId: AZIR, championCardId: VI });
  });

  it("falls back when the list's own legend line matched no card", () => {
    expect(
      resolveMetaPlayerCards({
        cards: [{ zone: "legend", cardId: null }],
        legendCardId: YASUO,
        championCardId: null,
      }),
    ).toEqual({ legendCardId: YASUO, championCardId: null });
  });

  it("reports nothing known when neither the list nor the source names one", () => {
    expect(
      resolveMetaPlayerCards({
        cards: [{ zone: "main", cardId: SHOCK }],
        legendCardId: null,
        championCardId: null,
      }),
    ).toEqual({ legendCardId: null, championCardId: null });
  });
});

describe("metaDeckCardEntries", () => {
  it("adds the legend the source named beside a list that carries none", () => {
    expect(
      metaDeckCardEntries({
        cards: [{ zone: "main", cardId: SHOCK, quantity: 3 }],
        legendCardId: YASUO,
        championCardId: null,
      }),
    ).toEqual([
      { cardId: SHOCK, zone: "main", quantity: 3 },
      { cardId: YASUO, zone: "legend", quantity: 1 },
    ]);
  });

  it("leaves a list that fills its own legend zone untouched", () => {
    expect(
      metaDeckCardEntries({
        cards: [
          { zone: "legend", cardId: AZIR, quantity: 1 },
          { zone: "main", cardId: SHOCK, quantity: 3 },
        ],
        legendCardId: YASUO,
        championCardId: null,
      }),
    ).toEqual([
      { cardId: AZIR, zone: "legend", quantity: 1 },
      { cardId: SHOCK, zone: "main", quantity: 3 },
    ]);
  });

  it("gives a standings-only entry no rows, though the source named its legend", () => {
    expect(metaDeckCardEntries({ cards: null, legendCardId: YASUO, championCardId: VI })).toEqual(
      [],
    );
  });

  it("drops a line whose name matched nothing", () => {
    expect(
      metaDeckCardEntries({
        cards: [
          { zone: "main", cardId: SHOCK, quantity: 3 },
          { zone: "main", cardId: null, quantity: 2 },
        ],
        legendCardId: null,
        championCardId: null,
      }),
    ).toEqual([{ cardId: SHOCK, zone: "main", quantity: 3 }]);
  });

  it("sums two lines that resolved to the same card and zone", () => {
    expect(
      metaDeckCardEntries({
        cards: [
          { zone: "main", cardId: SHOCK, quantity: 2 },
          { zone: "main", cardId: SHOCK, quantity: 1 },
        ],
        legendCardId: null,
        championCardId: null,
      }),
    ).toEqual([{ cardId: SHOCK, zone: "main", quantity: 3 }]);
  });

  it("seeds the legend from the source when the list's own legend line matched nothing", () => {
    expect(
      metaDeckCardEntries({
        cards: [{ zone: "legend", cardId: null, quantity: 1 }],
        legendCardId: YASUO,
        championCardId: null,
      }),
    ).toEqual([{ cardId: YASUO, zone: "legend", quantity: 1 }]);
  });
});

describe("metaCandidateState", () => {
  it("calls an unlinked candidate new, whatever the diff says", () => {
    expect(metaCandidateState(false, false)).toBe("new");
    expect(metaCandidateState(false, true)).toBe("new");
  });

  it("distinguishes a linked candidate by its diff", () => {
    expect(metaCandidateState(true, true)).toBe("changed");
    expect(metaCandidateState(true, false)).toBe("inSync");
  });
});
