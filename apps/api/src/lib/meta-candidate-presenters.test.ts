import { describe, expect, it } from "vitest";

import type {
  CandidateMetaEventRow,
  CandidateMetaPlayerRow,
} from "../repositories/meta-candidates.js";
import type { MetaPlayerDiff } from "./meta-candidate-diff.js";
import {
  toMetaCandidateDetail,
  toMetaCandidatePlayer,
  toMetaCandidateQueueRow,
  toMetaCandidateSource,
  unresolvedCardNames,
} from "./meta-candidate-presenters.js";

const AZIR = "11111111-0000-7000-8000-000000000001";
const SHOCK = "11111111-0000-7000-8000-000000000003";
const VI = "11111111-0000-7000-8000-000000000004";

const CHECKED = new Date("2026-08-10T09:30:00.000Z");

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
    tier: "store",
    country: "DE",
    location: "Kartenstraße 1, 10115 Berlin, DE",
    metaEventId: null,
    raw: null,
    fetchedAt: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-03T11:00:00.000Z"),
    ...overrides,
  };
}

function playerRow(overrides: Partial<CandidateMetaPlayerRow> = {}): CandidateMetaPlayerRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000010",
    candidateEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    metaEventId: null,
    submittedByUserId: null,
    submissionNote: null,
    externalId: "player-991",
    uvsgamesPlayerId: null,
    playerName: "Renata",
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
    matchPoints: null,
    opponentMatchWinPct: null,
    gameWinPct: null,
    opponentGameWinPct: null,
    entryStatus: null,
    legendName: "Azir",
    legendCardId: AZIR,
    championName: "Vi",
    championCardId: VI,
    cards: [
      { name: "Azir", zone: "legend", quantity: 1, cardId: AZIR },
      { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
    ],
    listStatus: "full",
    metaEventPlayerId: null,
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

const LOOKUPS = { cardNames: CARD_NAMES, eventNames: EVENT_NAMES };

const UNLINKED = { diff: null, deckId: null, shareToken: null, ...LOOKUPS };

const EMPTY_DIFF: MetaPlayerDiff = { fields: [], cards: { added: [], removed: [], changed: [] } };

describe("unresolvedCardNames", () => {
  it("returns nothing when every name matched", () => {
    expect(unresolvedCardNames(playerRow().cards)).toEqual([]);
  });

  it("returns nothing for a standings-only row, which has no list to gate", () => {
    expect(unresolvedCardNames(null)).toEqual([]);
  });

  it("lists the unmatched names once each", () => {
    expect(
      unresolvedCardNames([
        { name: "Mystery Card", zone: "main", quantity: 2, cardId: null },
        { name: "Mystery Card", zone: "sideboard", quantity: 1, cardId: null },
        { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
      ]),
    ).toEqual(["Mystery Card"]);
  });
});

describe("toMetaCandidatePlayer", () => {
  it("presents an unlinked row as new with no diff", () => {
    expect(toMetaCandidatePlayer(playerRow(), UNLINKED)).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000010",
      externalId: "player-991",
      playerName: "Renata",
      rank: 1,
      rankIsTier: false,
      wins: 5,
      losses: 1,
      draws: 0,
      legendName: "Azir",
      legendCardId: AZIR,
      championName: "Vi",
      championCardId: VI,
      cards: [
        { name: "Azir", zone: "legend", quantity: 1, cardId: AZIR },
        { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
      ],
      listStatus: "full",
      unresolvedNames: [],
      metaEventPlayerId: null,
      deckId: null,
      shareToken: null,
      submittedByUserId: null,
      submittedByName: null,
      submissionNote: null,
      state: "new",
      diff: null,
      checkedAt: null,
    });
  });

  it("presents a linked user submission whole, attribution included", () => {
    const row = toMetaCandidatePlayer(
      playerRow({
        candidateEventId: null,
        metaEventId: "live-1",
        metaEventPlayerId: "player-1",
        submittedByUserId: "user-7",
        submissionNote: "Saw it on the stream.",
        checkedAt: CHECKED,
      }),
      {
        diff: EMPTY_DIFF,
        deckId: "deck-1",
        shareToken: "aB3xY9zQ1p2R",
        ...LOOKUPS,
        submittedByName: "Skarner Fan",
      },
    );
    expect(row).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000010",
      externalId: "player-991",
      playerName: "Renata",
      rank: 1,
      rankIsTier: false,
      wins: 5,
      losses: 1,
      draws: 0,
      legendName: "Azir",
      legendCardId: AZIR,
      championName: "Vi",
      championCardId: VI,
      cards: [
        { name: "Azir", zone: "legend", quantity: 1, cardId: AZIR },
        { name: "Shock", zone: "main", quantity: 3, cardId: SHOCK },
      ],
      listStatus: "full",
      unresolvedNames: [],
      metaEventPlayerId: "player-1",
      deckId: "deck-1",
      shareToken: "aB3xY9zQ1p2R",
      submittedByUserId: "user-7",
      submittedByName: "Skarner Fan",
      submissionNote: "Saw it on the stream.",
      state: "inSync",
      diff: EMPTY_DIFF,
      checkedAt: "2026-08-10T09:30:00.000Z",
    });
  });

  it("keeps a standings-only row's list null rather than empty", () => {
    const row = toMetaCandidatePlayer(
      playerRow({ cards: null, listStatus: "none", championName: null, championCardId: null }),
      UNLINKED,
    );
    expect(row.cards).toBeNull();
    expect(row.listStatus).toBe("none");
    expect(row.unresolvedNames).toEqual([]);
    expect(row.legendCardId).toBe(AZIR);
  });

  it("carries a tier-only standing and an unknown record through", () => {
    const row = toMetaCandidatePlayer(
      playerRow({ rank: 8, rankIsTier: true, wins: null, losses: null, draws: null }),
      UNLINKED,
    );
    expect(row.rank).toBe(8);
    expect(row.rankIsTier).toBe(true);
    expect(row.wins).toBeNull();
    expect(row.losses).toBeNull();
    expect(row.draws).toBeNull();
  });

  it("keeps a legend name the matcher could not resolve", () => {
    const row = toMetaCandidatePlayer(
      playerRow({ legendName: "Azyr", legendCardId: null, cards: null, listStatus: "none" }),
      UNLINKED,
    );
    expect(row.legendName).toBe("Azyr");
    expect(row.legendCardId).toBeNull();
  });

  it("carries a partial claim through as its own state", () => {
    expect(toMetaCandidatePlayer(playerRow({ listStatus: "partial" }), UNLINKED).listStatus).toBe(
      "partial",
    );
  });

  it("serializes checkedAt as an ISO instant", () => {
    expect(toMetaCandidatePlayer(playerRow({ checkedAt: CHECKED }), UNLINKED).checkedAt).toBe(
      "2026-08-10T09:30:00.000Z",
    );
  });

  it("calls a linked row with an empty diff inSync", () => {
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff: EMPTY_DIFF,
      deckId: "deck-1",
      shareToken: "aB3xY9zQ1p2R",
      ...LOOKUPS,
    });
    expect(row.state).toBe("inSync");
    expect(row.shareToken).toBe("aB3xY9zQ1p2R");
  });

  it("links on the live standings row, not on the deck it may not have", () => {
    const row = toMetaCandidatePlayer(
      playerRow({ metaEventPlayerId: "player-1", cards: null, listStatus: "none" }),
      { diff: EMPTY_DIFF, deckId: null, shareToken: null, ...LOOKUPS },
    );
    expect(row.state).toBe("inSync");
    expect(row.deckId).toBeNull();
  });

  it("calls a linked row with a diff changed, and names every diff row", () => {
    const diff: MetaPlayerDiff = {
      fields: [{ field: "rank", from: 1, to: 4 }],
      cards: {
        added: [{ cardId: SHOCK, zone: "main", quantity: 3 }],
        removed: [{ cardId: AZIR, zone: "legend", quantity: 1 }],
        changed: [{ cardId: SHOCK, zone: "sideboard", from: 1, to: 2 }],
      },
    };
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff,
      deckId: "deck-1",
      shareToken: null,
      ...LOOKUPS,
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
    const diff: MetaPlayerDiff = {
      fields: [],
      cards: {
        added: [{ cardId: "unknown-card", zone: "main", quantity: 1 }],
        removed: [],
        changed: [],
      },
    };
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff,
      deckId: "deck-1",
      shareToken: null,
      ...LOOKUPS,
    });
    expect(row.diff?.cards.added[0].name).toBeNull();
  });

  it("names both sides of an event move, which the diff carries as ids", () => {
    const diff: MetaPlayerDiff = {
      fields: [{ field: "event", from: "live-2", to: "live-1" }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff,
      deckId: "deck-1",
      shareToken: null,
      ...LOOKUPS,
    });
    expect(row.state).toBe("changed");
    expect(row.diff?.fields).toEqual([
      { field: "event", from: "Summoner Skirmish Cologne", to: "Summoner Skirmish Berlin" },
    ]);
  });

  it("leaves an event id in place when no name is known for it", () => {
    const diff: MetaPlayerDiff = {
      fields: [{ field: "event", from: "live-gone", to: null }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff,
      deckId: "deck-1",
      shareToken: null,
      ...LOOKUPS,
    });
    expect(row.diff?.fields).toEqual([{ field: "event", from: "live-gone", to: null }]);
  });

  it("leaves other field diffs alone", () => {
    const diff: MetaPlayerDiff = {
      fields: [{ field: "playerName", from: "live-1", to: "live-2" }],
      cards: { added: [], removed: [], changed: [] },
    };
    const row = toMetaCandidatePlayer(playerRow({ metaEventPlayerId: "player-1" }), {
      diff,
      deckId: "deck-1",
      shareToken: null,
      ...LOOKUPS,
    });
    expect(row.diff?.fields).toEqual([{ field: "playerName", from: "live-1", to: "live-2" }]);
  });
});

describe("toMetaCandidateQueueRow", () => {
  const counts = {
    playerRowCount: 8,
    unacceptedPlayerCount: 8,
    unresolvedCardCount: 0,
    linkedSourceCount: 0,
    hasDiff: false,
    metaEventSlug: null,
  };

  it("presents an unlinked candidate as new", () => {
    expect(toMetaCandidateQueueRow(eventRow(), counts)).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      provider: "riftdecks",
      externalId: "evt-482",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      playerRowCount: 8,
      unacceptedPlayerCount: 8,
      unresolvedCardCount: 0,
      linkedSourceCount: 0,
      state: "new",
      checkedAt: null,
      metaEventId: null,
      metaEventSlug: null,
    });
  });

  it("passes the aggregate counts through", () => {
    const row = toMetaCandidateQueueRow(eventRow(), {
      ...counts,
      playerRowCount: 64,
      unacceptedPlayerCount: 3,
      unresolvedCardCount: 5,
      linkedSourceCount: 2,
    });
    expect(row.playerRowCount).toBe(64);
    expect(row.unacceptedPlayerCount).toBe(3);
    expect(row.unresolvedCardCount).toBe(5);
    expect(row.linkedSourceCount).toBe(2);
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
  it("presents an unlinked candidate with no diff and its standings", () => {
    const player = toMetaCandidatePlayer(playerRow(), UNLINKED);
    const source = toMetaCandidateSource(eventRow(), [player]);
    const detail = toMetaCandidateDetail(eventRow(), {
      diff: null,
      formatKnown: true,
      metaEventSlug: null,
      players: [player],
      sources: [source],
      submittedPlayers: [],
    });
    expect(detail).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      provider: "riftdecks",
      externalId: "evt-482",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      formatKnown: true,
      playerCount: 64,
      organizer: "LGS Berlin",
      sourceUrl: "https://example.invalid/skirmish",
      notes: "Top 8 lists only.",
      tier: "store",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      extraData: null,
      metaEventId: null,
      metaEventSlug: null,
      state: "new",
      diff: null,
      checkedAt: null,
      players: [player],
      sources: [source],
      submittedPlayers: [],
    });
  });

  it("carries extraData through untouched", () => {
    const detail = toMetaCandidateDetail(eventRow({ extraData: { region: "EUW" } }), {
      diff: null,
      formatKnown: false,
      metaEventSlug: null,
      players: [],
      sources: [],
      submittedPlayers: [],
    });
    expect(detail.extraData).toEqual({ region: "EUW" });
    expect(detail.formatKnown).toBe(false);
  });

  it("calls a linked candidate with field diffs changed", () => {
    const detail = toMetaCandidateDetail(eventRow({ metaEventId: "live-1" }), {
      diff: [{ field: "name", from: "Old", to: "New" }],
      formatKnown: true,
      metaEventSlug: "skirmish-2026",
      players: [],
      sources: [],
      submittedPlayers: [],
    });
    expect(detail.state).toBe("changed");
    expect(detail.metaEventSlug).toBe("skirmish-2026");
  });

  it("calls a linked candidate with an empty diff inSync", () => {
    const detail = toMetaCandidateDetail(eventRow({ metaEventId: "live-1" }), {
      diff: [],
      formatKnown: true,
      metaEventSlug: "skirmish-2026",
      players: [],
      sources: [],
      submittedPlayers: [],
    });
    expect(detail.state).toBe("inSync");
  });

  it("carries every sibling source and the directly-submitted rows", () => {
    const own = toMetaCandidatePlayer(playerRow(), UNLINKED);
    const submitted = toMetaCandidatePlayer(
      playerRow({
        id: "3f7a1c2e-0000-7000-8000-000000000099",
        candidateEventId: null,
        metaEventId: "live-1",
        submittedByUserId: "user-7",
      }),
      { ...UNLINKED, submittedByName: "Skarner Fan" },
    );
    const detail = toMetaCandidateDetail(eventRow({ metaEventId: "live-1" }), {
      diff: [],
      formatKnown: true,
      metaEventSlug: "skirmish-2026",
      players: [own],
      sources: [
        toMetaCandidateSource(eventRow({ metaEventId: "live-1" }), [own]),
        toMetaCandidateSource(
          eventRow({ id: "other", provider: "playriftbound", externalId: "prb-3" }),
          [],
        ),
      ],
      submittedPlayers: [submitted],
    });

    expect(detail.sources.map((source) => source.provider)).toEqual(["riftdecks", "playriftbound"]);
    expect(detail.submittedPlayers).toEqual([submitted]);
  });
});

describe("submitter attribution", () => {
  it("carries the submitter, their resolved name, and their note", () => {
    const player = toMetaCandidatePlayer(
      playerRow({ submittedByUserId: "user-7", submissionNote: "Saw it on the stream." }),
      { ...UNLINKED, submittedByName: "Skarner Fan" },
    );
    expect(player.submittedByUserId).toBe("user-7");
    expect(player.submittedByName).toBe("Skarner Fan");
    expect(player.submissionNote).toBe("Saw it on the stream.");
  });

  it("leaves a provider row unattributed", () => {
    const player = toMetaCandidatePlayer(playerRow(), UNLINKED);
    expect(player.submittedByUserId).toBeNull();
    expect(player.submittedByName).toBeNull();
    expect(player.submissionNote).toBeNull();
  });

  it("leaves a submitter whose name is gone unnamed", () => {
    const player = toMetaCandidatePlayer(playerRow({ submittedByUserId: "user-7" }), {
      ...UNLINKED,
      submittedByName: null,
    });
    expect(player.submittedByUserId).toBe("user-7");
    expect(player.submittedByName).toBeNull();
  });
});

describe("toMetaCandidateSource", () => {
  it("presents one source column with its own values and standings", () => {
    const player = toMetaCandidatePlayer(playerRow(), UNLINKED);
    const source = toMetaCandidateSource(
      eventRow({ provider: "uvsgames", externalId: "uvs-9", checkedAt: CHECKED }),
      [player],
    );
    expect(source).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      provider: "uvsgames",
      externalId: "uvs-9",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      playerCount: 64,
      organizer: "LGS Berlin",
      sourceUrl: "https://example.invalid/skirmish",
      notes: "Top 8 lists only.",
      tier: "store",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      checkedAt: "2026-08-10T09:30:00.000Z",
      players: [player],
    });
  });

  it("reports a source that has pushed no standings as an empty column", () => {
    const source = toMetaCandidateSource(eventRow(), []);
    expect(source.players).toEqual([]);
    expect(source.checkedAt).toBeNull();
  });
});
