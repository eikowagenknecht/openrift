import { describe, expect, it } from "vitest";

import type {
  CandidateMetaDeckRow,
  CandidateMetaEventRow,
} from "../repositories/meta-candidates.js";
import type { MetaDeckDiff } from "./meta-candidate-diff.js";
import {
  toMetaCandidateDeck,
  toMetaCandidateDetail,
  toMetaCandidateQueueRow,
  unresolvedCardNames,
} from "./meta-candidate-presenters.js";

const AZIR = "11111111-0000-7000-8000-000000000001";
const SHOCK = "11111111-0000-7000-8000-000000000003";

const CHECKED = new Date("2026-08-10T09:30:00.000Z");

/** @returns A candidate event row with every field populated. */
function eventRow(overrides: Partial<CandidateMetaEventRow> = {}): CandidateMetaEventRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    provider: "riftdecks",
    externalId: "evt-482",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    sourceUrl: "https://example.invalid/skirmish",
    notes: "Top 8 lists only.",
    metaEventId: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-03T11:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A candidate deck row whose cards all resolved. */
function deckRow(overrides: Partial<CandidateMetaDeckRow> = {}): CandidateMetaDeckRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000010",
    candidateEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    externalId: "deck-991",
    playerName: "Renata",
    finishTier: 1,
    record: "5-1",
    name: null,
    cards: [
      { name: "Azir", zone: "legend", quantity: 1, cardId: AZIR },
      { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
    ],
    listStatus: "full",
    deckId: null,
    checkedAt: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-03T11:00:00.000Z"),
    ...overrides,
  };
}

const CARD_NAMES = new Map([
  [AZIR, "Azir, Emperor of the Sands"],
  [SHOCK, "Shock"],
]);

const EVENT_NAMES = new Map([
  ["live-1", "Summoner Skirmish Berlin"],
  ["live-2", "Summoner Skirmish Cologne"],
]);

describe("unresolvedCardNames", () => {
  it("returns nothing when every name matched", () => {
    expect(unresolvedCardNames(deckRow())).toEqual([]);
  });

  it("lists the unmatched names once each", () => {
    const deck = deckRow({
      cards: [
        { name: "Mystery Card", zone: "main", quantity: 2, cardId: null },
        { name: "Mystery Card", zone: "sideboard", quantity: 1, cardId: null },
        { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
      ],
    });
    expect(unresolvedCardNames(deck)).toEqual(["Mystery Card"]);
  });
});

describe("toMetaCandidateDeck", () => {
  it("presents an unlinked deck as new with no diff", () => {
    const row = toMetaCandidateDeck(deckRow(), {
      diff: null,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.state).toBe("new");
    expect(row.diff).toBeNull();
    expect(row.deckId).toBeNull();
    expect(row.unresolvedNames).toEqual([]);
    expect(row.cards).toHaveLength(2);
    expect(row.checkedAt).toBeNull();
    expect(row.listStatus).toBe("full");
  });

  it("carries the source's archetype claim through", () => {
    const row = toMetaCandidateDeck(
      deckRow({
        listStatus: "archetype",
        cards: [{ name: "Azir", zone: "legend", quantity: 1, cardId: AZIR }],
      }),
      { diff: null, shareToken: null, cardNames: CARD_NAMES, eventNames: EVENT_NAMES },
    );
    expect(row.listStatus).toBe("archetype");
    expect(row.unresolvedNames).toEqual([]);
  });

  it("carries a partial claim through as its own state", () => {
    const row = toMetaCandidateDeck(deckRow({ listStatus: "partial" }), {
      diff: null,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.listStatus).toBe("partial");
  });

  it("serializes checkedAt as an ISO instant", () => {
    const row = toMetaCandidateDeck(deckRow({ checkedAt: CHECKED }), {
      diff: null,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.checkedAt).toBe("2026-08-10T09:30:00.000Z");
  });

  it("calls a linked deck with an empty diff inSync", () => {
    const diff: MetaDeckDiff = { fields: [], cards: { added: [], removed: [], changed: [] } };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: "aB3xY9zQ1p2R",
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.state).toBe("inSync");
    expect(row.shareToken).toBe("aB3xY9zQ1p2R");
  });

  it("calls a linked deck with a diff changed, and names every diff row", () => {
    const diff: MetaDeckDiff = {
      fields: [{ field: "finishTier", from: 1, to: 4 }],
      cards: {
        added: [{ cardId: SHOCK, zone: "main", quantity: 3 }],
        removed: [{ cardId: AZIR, zone: "legend", quantity: 1 }],
        changed: [{ cardId: SHOCK, zone: "sideboard", from: 1, to: 2 }],
      },
    };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.state).toBe("changed");
    expect(row.diff?.cards.added[0]).toEqual({
      cardId: SHOCK,
      zone: "main",
      quantity: 3,
      name: "Shock",
    });
    expect(row.diff?.cards.removed[0].name).toBe("Azir, Emperor of the Sands");
    expect(row.diff?.cards.changed[0].name).toBe("Shock");
  });

  it("leaves a diff row unnamed when the card is missing from the lookup", () => {
    const diff: MetaDeckDiff = {
      fields: [],
      cards: {
        added: [{ cardId: "unknown-card", zone: "main", quantity: 1 }],
        removed: [],
        changed: [],
      },
    };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.diff?.cards.added[0].name).toBeNull();
  });

  it("names both sides of an event move, which the diff carries as ids", () => {
    const diff: MetaDeckDiff = {
      fields: [{ field: "event", from: "live-2", to: "live-1" }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.state).toBe("changed");
    expect(row.diff?.fields).toEqual([
      { field: "event", from: "Summoner Skirmish Cologne", to: "Summoner Skirmish Berlin" },
    ]);
  });

  it("leaves an event id in place when no name is known for it", () => {
    const diff: MetaDeckDiff = {
      fields: [{ field: "event", from: "live-gone", to: null }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.diff?.fields).toEqual([{ field: "event", from: "live-gone", to: null }]);
  });

  it("leaves other field diffs alone", () => {
    const diff: MetaDeckDiff = {
      fields: [{ field: "name", from: "live-1", to: "live-2" }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidateDeck(deckRow({ deckId: "deck-1" }), {
      diff,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    expect(row.diff?.fields).toEqual([{ field: "name", from: "live-1", to: "live-2" }]);
  });
});

describe("toMetaCandidateQueueRow", () => {
  const counts = {
    deckCount: 8,
    unacceptedDeckCount: 8,
    unresolvedCardCount: 0,
    hasDiff: false,
    metaEventSlug: null,
  };

  it("presents an unlinked candidate as new", () => {
    const row = toMetaCandidateQueueRow(eventRow(), counts);
    expect(row).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      provider: "riftdecks",
      externalId: "evt-482",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      deckCount: 8,
      unacceptedDeckCount: 8,
      unresolvedCardCount: 0,
      state: "new",
      checkedAt: null,
      metaEventId: null,
      metaEventSlug: null,
    });
  });

  it("passes the aggregate counts through", () => {
    const row = toMetaCandidateQueueRow(eventRow(), {
      ...counts,
      unacceptedDeckCount: 3,
      unresolvedCardCount: 5,
    });
    expect(row.unacceptedDeckCount).toBe(3);
    expect(row.unresolvedCardCount).toBe(5);
  });

  it("derives changed and inSync from the link plus the diff", () => {
    const linked = eventRow({ metaEventId: "live-1", checkedAt: CHECKED });
    expect(
      toMetaCandidateQueueRow(linked, { ...counts, hasDiff: true, metaEventSlug: "skirmish-2026" })
        .state,
    ).toBe("changed");
    expect(toMetaCandidateQueueRow(linked, { ...counts, metaEventSlug: "skirmish-2026" })).toEqual(
      expect.objectContaining({
        state: "inSync",
        metaEventId: "live-1",
        metaEventSlug: "skirmish-2026",
        checkedAt: "2026-08-10T09:30:00.000Z",
      }),
    );
  });
});

describe("toMetaCandidateDetail", () => {
  it("presents an unlinked candidate with no diff and its decks", () => {
    const deck = toMetaCandidateDeck(deckRow(), {
      diff: null,
      shareToken: null,
      cardNames: CARD_NAMES,
      eventNames: EVENT_NAMES,
    });
    const detail = toMetaCandidateDetail(eventRow(), {
      diff: null,
      formatKnown: true,
      metaEventSlug: null,
      decks: [deck],
    });
    expect(detail.state).toBe("new");
    expect(detail.diff).toBeNull();
    expect(detail.formatKnown).toBe(true);
    expect(detail.decks).toEqual([deck]);
    expect(detail.extraData).toBeNull();
  });

  it("carries extraData through untouched", () => {
    const detail = toMetaCandidateDetail(eventRow({ extraData: { region: "EUW" } }), {
      diff: null,
      formatKnown: false,
      metaEventSlug: null,
      decks: [],
    });
    expect(detail.extraData).toEqual({ region: "EUW" });
    expect(detail.formatKnown).toBe(false);
  });

  it("calls a linked candidate with field diffs changed", () => {
    const detail = toMetaCandidateDetail(eventRow({ metaEventId: "live-1" }), {
      diff: [{ field: "name", from: "Old", to: "New" }],
      formatKnown: true,
      metaEventSlug: "skirmish-2026",
      decks: [],
    });
    expect(detail.state).toBe("changed");
    expect(detail.metaEventSlug).toBe("skirmish-2026");
  });

  it("calls a linked candidate with an empty diff inSync", () => {
    const detail = toMetaCandidateDetail(eventRow({ metaEventId: "live-1" }), {
      diff: [],
      formatKnown: true,
      metaEventSlug: "skirmish-2026",
      decks: [],
    });
    expect(detail.state).toBe("inSync");
  });
});
