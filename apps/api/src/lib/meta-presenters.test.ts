import { describe, expect, it } from "vitest";

import type { MetaSubmissionRow } from "../repositories/meta-submissions.js";
import type {
  AdminMetaPlayerRow,
  MetaArchiveLegendRow,
  MetaContributorRow,
  MetaDeckContextRow,
  MetaDeckSummaryRow,
  MetaEventPlayerRow,
  MetaEventSourceRow,
  MetaEventWithCounts,
  MetaLegendFinishRow,
  MetaPlayerFinishRow,
} from "../repositories/meta.js";
import {
  archiveLegendSlug,
  toMetaLegendFinish,
  toMetaLegendSummary,
  toAdminMetaEvent,
  toAdminMetaEventCorrection,
  toAdminMetaPlayer,
  toAdminMetaSubmission,
  toMetaDeckCardIndex,
  toMetaDeckContext,
  toMetaDeckSummary,
  toMetaEventDetail,
  toMetaEventMatch,
  toMetaEventPhase,
  toMetaEventPlayer,
  toMetaEventSource,
  toMetaEventSummary,
  toMetaEventFinish,
  toMetaPlayerFinish,
  toMetaSubmission,
} from "./meta-presenters.js";

function eventRow(overrides: Partial<MetaEventWithCounts> = {}): MetaEventWithCounts {
  return {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    slug: "summoner-skirmish-berlin",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: "Top 8 lists only.",
    tier: "local",
    country: "DE",
    location: "Kartenstraße 1, 10115 Berlin, DE",
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-03T11:00:00.000Z"),
    playerRowCount: 64,
    deckCount: 8,
    ...overrides,
  };
}

function playerRow(overrides: Partial<MetaEventPlayerRow> = {}): MetaEventPlayerRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-0000000000c1",
    rank: 1,
    rankIsTier: false,
    playerName: "Nova",
    sourceIdentity: "u347713",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: "legend-1",
    legendName: "Jinx",
    legendSlug: "jinx",
    legendTypes: ["legend"],
    legendTags: [],
    legendDomains: ["chaos", "fury"],
    championCardId: "champion-1",
    championName: "Vi",
    championSlug: "vi",
    championDomains: ["body"],
    deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
    deckName: "Jinx Aggro",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    ...overrides,
  };
}

function deckRow(overrides: Partial<MetaDeckSummaryRow> = {}): MetaDeckSummaryRow {
  return {
    playerId: "3f7a1c2e-0000-7000-8000-0000000000c1",
    deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
    shareToken: "aB3dE5gH7jK9",
    listStatus: "full",
    deckName: "Jinx Aggro",
    deckFormat: "constructed",
    legendCardId: "legend-1",
    legendName: "Jinx",
    legendSlug: "jinx",
    legendTypes: ["legend"],
    legendTags: [],
    championCardId: "champion-1",
    championName: "Vi",
    playerName: "Nova",
    sourceIdentity: "u347713",
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    eventTier: "local",
    eventCountry: "DE",
    ...overrides,
  };
}

const IMAGES = new Map([
  ["legend-1", "image-legend"],
  ["champion-1", "image-champion"],
]);

describe("toMetaEventSummary", () => {
  it("maps the list row, date column unreformatted and timestamps dropped", () => {
    expect(toMetaEventSummary(eventRow())).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      playerCount: 64,
      organizer: "LGS Berlin",
      playerRowCount: 64,
      deckCount: 8,
      topFinishes: [],
    });
  });

  it("carries the nullable fields through as null", () => {
    const summary = toMetaEventSummary(
      eventRow({ playerCount: null, organizer: null, location: null }),
    );
    expect(summary.playerCount).toBeNull();
    expect(summary.organizer).toBeNull();
    expect(summary.location).toBeNull();
  });

  it("keeps the standings count apart from the decks known for it", () => {
    const summary = toMetaEventSummary(eventRow({ playerRowCount: 128, deckCount: 0 }));
    expect(summary.playerRowCount).toBe(128);
    expect(summary.deckCount).toBe(0);
  });

  it("carries every finish it was handed", () => {
    const summary = toMetaEventSummary(eventRow(), [
      toMetaEventFinish(playerRow(), IMAGES),
      toMetaEventFinish(playerRow({ playerName: "Rell", rank: 2 }), IMAGES),
    ]);
    expect(summary.topFinishes.map((entry) => entry.playerName)).toEqual(["Nova", "Rell"]);
  });

  it("has no finishes for an event whose standings have not arrived", () => {
    expect(toMetaEventSummary(eventRow()).topFinishes).toEqual([]);
  });
});

describe("toMetaEventFinish", () => {
  it("names the finish's legend the way players say it, with its artwork and rank", () => {
    expect(toMetaEventFinish(playerRow(), IMAGES)).toEqual({
      rank: 1,
      rankIsTier: false,
      playerName: "Nova",
      playerKey: "u347713",
      wins: 5,
      losses: 1,
      draws: 0,
      legend: {
        cardId: "legend-1",
        name: "Jinx",
        slug: "jinx",
        imageId: "image-legend",
        domains: ["chaos", "fury"],
        archiveSlug: "jinx",
      },
    });
  });

  it("gives the finish's legend its real domains, so an inline row draws its runes", () => {
    const finish = toMetaEventFinish(playerRow({ legendDomains: ["order"] }), IMAGES);
    expect(finish.legend?.domains).toEqual(["order"]);
  });

  it("draws no runes for a legend the aggregates view has not caught up with", () => {
    const finish = toMetaEventFinish(playerRow({ legendDomains: null }), IMAGES);
    expect(finish.legend?.domains).toEqual([]);
  });

  it("keeps the finish when the archive never learned their legend", () => {
    const finish = toMetaEventFinish(playerRow({ legendCardId: null, legendName: null }), IMAGES);
    expect(finish).toMatchObject({ playerName: "Nova", legend: null });
  });

  it("folds the source identity into a page key, and leaves a hand-entered row without one", () => {
    expect(toMetaEventFinish(playerRow({ sourceIdentity: "pn乌冬#2" }), IMAGES).playerKey).toBe(
      "pn乌冬",
    );
    expect(toMetaEventFinish(playerRow({ sourceIdentity: null }), IMAGES).playerKey).toBeNull();
  });

  it("carries a cut-bucket rank as the tier it is", () => {
    const finish = toMetaEventFinish(playerRow({ rank: 3, rankIsTier: true }), IMAGES);
    expect(finish).toMatchObject({ rank: 3, rankIsTier: true });
  });

  it("leaves the record null when the source published none", () => {
    const finish = toMetaEventFinish(playerRow({ wins: null, losses: null, draws: null }), IMAGES);
    expect(finish).toMatchObject({ wins: null, losses: null, draws: null });
  });
});

function sourceRow(overrides: Partial<MetaEventSourceRow> = {}): MetaEventSourceRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-0000000000a1",
    metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    provider: "uvsgames",
    externalId: "evt-482",
    label: "uvsgames",
    priority: 0,
    sourceUrl: "https://example.invalid/skirmish",
    contributes: true,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

function contributorRow(overrides: Partial<MetaContributorRow> = {}): MetaContributorRow {
  return {
    metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    userId: "user-1",
    displayName: "Nova",
    ...overrides,
  };
}

describe("toMetaEventSource", () => {
  it("carries the provider key so a review screen can key its columns", () => {
    expect(toMetaEventSource(sourceRow())).toEqual({
      id: "3f7a1c2e-0000-7000-8000-0000000000a1",
      provider: "uvsgames",
      externalId: "evt-482",
      label: "uvsgames",
      sourceUrl: "https://example.invalid/skirmish",
    });
  });

  it("leaves a hand-entered citation's key null", () => {
    expect(
      toMetaEventSource(
        sourceRow({ provider: null, externalId: null, label: "Twitch VOD", sourceUrl: null }),
      ),
    ).toEqual({
      id: "3f7a1c2e-0000-7000-8000-0000000000a1",
      provider: null,
      externalId: null,
      label: "Twitch VOD",
      sourceUrl: null,
    });
  });
});

describe("toMetaEventDetail", () => {
  it("adds the long-form fields and the two attribution lists on top of the summary", () => {
    const detail = toMetaEventDetail(eventRow(), {
      sources: [sourceRow()],
      contributors: [contributorRow()],
    });
    expect(detail).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      playerCount: 64,
      organizer: "LGS Berlin",
      playerRowCount: 64,
      deckCount: 8,
      topFinishes: [],
      notes: "Top 8 lists only.",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      sources: [
        {
          id: "3f7a1c2e-0000-7000-8000-0000000000a1",
          provider: "uvsgames",
          externalId: "evt-482",
          label: "uvsgames",
          sourceUrl: "https://example.invalid/skirmish",
        },
      ],
      contributors: ["Nova"],
    });
  });

  it("keeps absent notes null", () => {
    const detail = toMetaEventDetail(eventRow({ notes: null }), { sources: [], contributors: [] });
    expect(detail.notes).toBeNull();
  });

  it("lists every citation, so two sources both get their credit", () => {
    const detail = toMetaEventDetail(eventRow(), {
      sources: [
        sourceRow(),
        sourceRow({
          id: "3f7a1c2e-0000-7000-8000-0000000000a2",
          provider: "playriftbound",
          externalId: "482",
          label: "playriftbound",
        }),
      ],
      contributors: [],
    });
    expect(detail.sources.map((source) => source.label)).toEqual(["uvsgames", "playriftbound"]);
  });

  it("prints contributors as plain names, never as user ids", () => {
    const detail = toMetaEventDetail(eventRow(), {
      sources: [],
      contributors: [contributorRow(), contributorRow({ userId: "user-2", displayName: "Rell" })],
    });
    expect(detail.contributors).toEqual(["Nova", "Rell"]);
  });

  it("has no source link column left to render", () => {
    const detail = toMetaEventDetail(eventRow(), { sources: [], contributors: [] });
    expect(detail).not.toHaveProperty("sourceUrl");
  });
});

describe("toMetaEventPhase", () => {
  it("keeps the source's own round vocabulary rather than normalizing it", () => {
    expect(
      toMetaEventPhase({
        id: "3f7a1c2e-0000-7000-8000-0000000000h1",
        metaEventId: "3f7a1c2e-0000-7000-8000-0000000000e1",
        phaseOrder: 1,
        name: "Phase 3",
        roundType: "RANKED_SINGLE_ELIMINATION",
        roundCount: 3,
        rankRequired: 8,
        maxGameWins: 2,
        createdAt: new Date("2026-08-18T10:00:00Z"),
        updatedAt: new Date("2026-08-18T10:00:00Z"),
      }),
    ).toEqual({
      phaseOrder: 1,
      name: "Phase 3",
      roundType: "RANKED_SINGLE_ELIMINATION",
      roundCount: 3,
      rankRequired: 8,
      maxGameWins: 2,
    });
  });

  it("carries a phase the source named nothing about", () => {
    expect(
      toMetaEventPhase({
        id: "3f7a1c2e-0000-7000-8000-0000000000h2",
        metaEventId: "3f7a1c2e-0000-7000-8000-0000000000e1",
        phaseOrder: 0,
        name: null,
        roundType: "SWISS",
        roundCount: null,
        rankRequired: null,
        maxGameWins: null,
        createdAt: new Date("2026-08-18T10:00:00Z"),
        updatedAt: new Date("2026-08-18T10:00:00Z"),
      }),
    ).toEqual({
      phaseOrder: 0,
      name: null,
      roundType: "SWISS",
      roundCount: null,
      rankRequired: null,
      maxGameWins: null,
    });
  });
});

describe("toMetaEventMatch", () => {
  it("keeps the per-match facts and drops the row bookkeeping", () => {
    expect(
      toMetaEventMatch({
        id: "3f7a1c2e-0000-7000-8000-0000000000m1",
        metaEventId: "3f7a1c2e-0000-7000-8000-0000000000e1",
        sourceMatchId: "7197367",
        sourceRoundId: "1267524",
        phaseOrder: 1,
        roundNumber: 3,
        tableNumber: null,
        isBye: true,
        isDraw: false,
        player1Id: "3f7a1c2e-0000-7000-8000-0000000000c1",
        player2Id: null,
        winnerId: "3f7a1c2e-0000-7000-8000-0000000000c1",
        gamesWonP1: 2,
        gamesWonP2: null,
        createdAt: new Date("2026-08-18T10:00:00Z"),
        updatedAt: new Date("2026-08-18T10:00:00Z"),
      }),
    ).toEqual({
      phaseOrder: 1,
      roundNumber: 3,
      tableNumber: null,
      isBye: true,
      isDraw: false,
      player1Id: "3f7a1c2e-0000-7000-8000-0000000000c1",
      player2Id: null,
      winnerId: "3f7a1c2e-0000-7000-8000-0000000000c1",
      gamesWonP1: 2,
      gamesWonP2: null,
    });
  });
});

describe("toMetaEventPlayer", () => {
  it("denormalizes each zone's card into a ref with its artwork", () => {
    expect(toMetaEventPlayer(playerRow(), IMAGES)).toEqual({
      id: "3f7a1c2e-0000-7000-8000-0000000000c1",
      rank: 1,
      rankIsTier: false,
      playerName: "Nova",
      playerKey: "u347713",
      wins: 5,
      losses: 1,
      draws: 0,
      legend: {
        cardId: "legend-1",
        name: "Jinx",
        slug: "jinx",
        imageId: "image-legend",
        domains: ["chaos", "fury"],
        archiveSlug: "jinx",
      },
      champion: {
        cardId: "champion-1",
        name: "Vi",
        slug: "vi",
        imageId: "image-champion",
        domains: ["body"],
        archiveSlug: null,
      },
      deckId: "3f7a1c2e-0000-7000-8000-00000000000d",
      deckName: "Jinx Aggro",
      shareToken: "aB3dE5gH7jK9",
      listStatus: "full",
    });
  });

  it("folds the source identity into a page key, and leaves a hand-entered row without one", () => {
    expect(toMetaEventPlayer(playerRow({ sourceIdentity: "pn乌冬#2" }), IMAGES).playerKey).toBe(
      "pn乌冬",
    );
    expect(toMetaEventPlayer(playerRow({ sourceIdentity: null }), IMAGES).playerKey).toBeNull();
  });

  it("leaves a standings-only entry with a legend but no page", () => {
    const player = toMetaEventPlayer(
      playerRow({ deckId: null, deckName: null, shareToken: null, listStatus: "none" }),
      IMAGES,
    );
    expect(player.deckId).toBeNull();
    expect(player.shareToken).toBeNull();
    expect(player.listStatus).toBe("none");
    expect(player.legend).toEqual({
      cardId: "legend-1",
      name: "Jinx",
      slug: "jinx",
      imageId: "image-legend",
      domains: ["chaos", "fury"],
      archiveSlug: "jinx",
    });
  });

  it("drops a zone the entry names no card for", () => {
    const player = toMetaEventPlayer(
      playerRow({ championCardId: null, championName: null }),
      IMAGES,
    );
    expect(player.champion).toBeNull();
  });

  it("keeps a card whose name never landed, so the artwork still renders", () => {
    const player = toMetaEventPlayer(playerRow({ legendName: null }), IMAGES);
    expect(player.legend).toEqual({
      cardId: "legend-1",
      name: "",
      slug: "jinx",
      imageId: "image-legend",
      domains: ["chaos", "fury"],
      // No name, so no key it could answer to; the row links at the card page.
      archiveSlug: null,
    });
  });

  it("names a card the aggregates view has not caught up with, without runes", () => {
    const player = toMetaEventPlayer(
      playerRow({ legendDomains: null, championDomains: null }),
      IMAGES,
    );
    expect(player.legend?.domains).toEqual([]);
    expect(player.champion?.domains).toEqual([]);
  });

  it("names a Legend for its champion, and leaves a champion unit's own name alone", () => {
    const player = toMetaEventPlayer(
      playerRow({
        legendName: "Emperor of the Sands",
        legendSlug: "emperor-of-the-sands",
        legendTags: ["Azir"],
        championName: "Vi, Piltover Enforcer",
      }),
      IMAGES,
    );

    expect(player.legend).toEqual({
      cardId: "legend-1",
      name: "Azir, Emperor of the Sands",
      slug: "emperor-of-the-sands",
      imageId: "image-legend",
      domains: ["chaos", "fury"],
      archiveSlug: "azir-emperor-of-the-sands",
    });
    expect(player.champion?.name).toBe("Vi, Piltover Enforcer");
  });

  it("gives a champion unit no archive key, so nothing links it at a page that is not there", () => {
    const player = toMetaEventPlayer(playerRow({ championName: "Vi, Piltover Enforcer" }), IMAGES);
    expect(player.champion?.archiveSlug).toBeNull();
    expect(player.champion?.slug).toBe("vi");
  });

  it("leaves a card that is not a tagged Legend under its own name", () => {
    const player = toMetaEventPlayer(
      playerRow({ legendName: "Jinx", legendTypes: ["unit"], legendTags: ["Jinx"] }),
      IMAGES,
    );
    expect(player.legend?.name).toBe("Jinx");
  });

  it("leaves the image null for a card with no artwork", () => {
    const player = toMetaEventPlayer(playerRow(), new Map([["legend-1", null]]));
    expect(player.legend?.imageId).toBeNull();
    expect(player.champion?.imageId).toBeNull();
  });

  it("prints a tier-only standing and an unknown record as they came", () => {
    const player = toMetaEventPlayer(
      playerRow({ rank: 8, rankIsTier: true, wins: null, losses: null, draws: null }),
      IMAGES,
    );
    expect(player.rank).toBe(8);
    expect(player.rankIsTier).toBe(true);
    expect(player.wins).toBeNull();
    expect(player.losses).toBeNull();
    expect(player.draws).toBeNull();
  });
});

describe("toMetaDeckCardIndex", () => {
  it("pools card ids and points each deck at them by position", () => {
    expect(
      toMetaDeckCardIndex([
        { deckId: "deck-1", cardId: "card-a", quantity: 3, sideboard: false },
        { deckId: "deck-1", cardId: "card-b", quantity: 1, sideboard: false },
        { deckId: "deck-2", cardId: "card-b", quantity: 2, sideboard: false },
      ]),
    ).toEqual({
      cards: ["card-a", "card-b"],
      decks: [
        { deckId: "deck-1", entries: [0, 3, 1, 1], sideboard: [] },
        { deckId: "deck-2", entries: [1, 2], sideboard: [] },
      ],
    });
  });

  it("keeps a deck whose rows arrive apart as one entry", () => {
    const index = toMetaDeckCardIndex([
      { deckId: "deck-1", cardId: "card-a", quantity: 1, sideboard: false },
      { deckId: "deck-2", cardId: "card-a", quantity: 1, sideboard: false },
      { deckId: "deck-1", cardId: "card-b", quantity: 4, sideboard: false },
    ]);
    expect(index.decks).toHaveLength(2);
    expect(index.decks[0]).toEqual({ deckId: "deck-1", entries: [0, 1, 1, 4], sideboard: [] });
  });

  it("splits the sideboard out of the summed zones", () => {
    expect(
      toMetaDeckCardIndex([
        { deckId: "deck-1", cardId: "card-a", quantity: 3, sideboard: false },
        { deckId: "deck-1", cardId: "card-b", quantity: 2, sideboard: true },
      ]),
    ).toEqual({
      cards: ["card-a", "card-b"],
      decks: [{ deckId: "deck-1", entries: [0, 3], sideboard: [1, 2] }],
    });
  });

  it("reuses one pool index for a card held in both the main deck and the sideboard", () => {
    expect(
      toMetaDeckCardIndex([
        { deckId: "deck-1", cardId: "card-a", quantity: 3, sideboard: false },
        { deckId: "deck-1", cardId: "card-a", quantity: 1, sideboard: true },
      ]),
    ).toEqual({
      cards: ["card-a"],
      decks: [{ deckId: "deck-1", entries: [0, 3], sideboard: [0, 1] }],
    });
  });

  it("gives a deck with no sideboard an empty sideboard run", () => {
    const index = toMetaDeckCardIndex([
      { deckId: "deck-1", cardId: "card-a", quantity: 4, sideboard: false },
    ]);
    expect(index.decks[0]?.sideboard).toEqual([]);
  });

  it("returns an empty index for an archive with no lists", () => {
    expect(toMetaDeckCardIndex([])).toEqual({ cards: [], decks: [] });
  });
});

describe("toMetaDeckSummary", () => {
  it("attaches the artwork resolved for each zone's card", () => {
    const summary = toMetaDeckSummary(deckRow(), IMAGES);
    expect(summary.legendImageId).toBe("image-legend");
    expect(summary.championImageId).toBe("image-champion");
  });

  it("nests the event so a row renders its byline standalone", () => {
    expect(toMetaDeckSummary(deckRow(), IMAGES).event).toEqual({
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
    });
  });

  it("composes the legend's archive key server-side, champion tag included", () => {
    const summary = toMetaDeckSummary(
      deckRow({ legendName: "Loose Cannon", legendSlug: "loose-cannon", legendTags: ["Jinx"] }),
      IMAGES,
    );
    expect(summary.legendArchiveSlug).toBe("jinx-loose-cannon");
  });

  it("keys an untagged legend by its card slug alone", () => {
    expect(toMetaDeckSummary(deckRow(), IMAGES).legendArchiveSlug).toBe("jinx");
  });

  it("leaves the archive key null for a deck whose legend zone is empty", () => {
    const summary = toMetaDeckSummary(
      deckRow({ legendCardId: null, legendName: null, legendSlug: null }),
      IMAGES,
    );
    expect(summary.legendArchiveSlug).toBeNull();
  });

  it("carries an event whose country no source published", () => {
    expect(toMetaDeckSummary(deckRow({ eventCountry: null }), IMAGES).event.country).toBeNull();
  });

  it("leaves a zone's image null when the deck has no card there", () => {
    const summary = toMetaDeckSummary(
      deckRow({ championCardId: null, championName: null }),
      IMAGES,
    );
    expect(summary.championCardId).toBeNull();
    expect(summary.championName).toBeNull();
    expect(summary.championImageId).toBeNull();
  });

  it("leaves the image null when the card has no artwork", () => {
    const summary = toMetaDeckSummary(deckRow(), new Map([["legend-1", null]]));
    expect(summary.legendImageId).toBeNull();
    expect(summary.championImageId).toBeNull();
  });

  it("renames the deck's own columns onto the wire shape", () => {
    const summary = toMetaDeckSummary(deckRow(), IMAGES);
    expect(summary.name).toBe("Jinx Aggro");
    expect(summary.format).toBe("constructed");
    expect(summary.shareToken).toBe("aB3dE5gH7jK9");
    expect(summary.listStatus).toBe("full");
  });

  it("carries the standings row the tile bylines, its own id included", () => {
    const summary = toMetaDeckSummary(deckRow(), IMAGES);
    expect(summary.playerId).toBe("3f7a1c2e-0000-7000-8000-0000000000c1");
    expect(summary.playerName).toBe("Nova");
    expect(summary.rank).toBe(1);
    expect(summary.rankIsTier).toBe(false);
    expect(summary.wins).toBe(5);
    expect(summary.losses).toBe(1);
    expect(summary.draws).toBe(0);
  });

  it("folds the source identity into a page key, and leaves a hand-entered row without one", () => {
    expect(toMetaDeckSummary(deckRow({ sourceIdentity: "pn乌冬#2" }), IMAGES).playerKey).toBe(
      "pn乌冬",
    );
    expect(toMetaDeckSummary(deckRow({ sourceIdentity: null }), IMAGES).playerKey).toBeNull();
  });

  it("carries a cut-bucket finish with no record", () => {
    const summary = toMetaDeckSummary(
      deckRow({ rank: 8, rankIsTier: true, wins: null, losses: null, draws: null }),
      IMAGES,
    );
    expect(summary.rank).toBe(8);
    expect(summary.rankIsTier).toBe(true);
    expect(summary.wins).toBeNull();
  });

  it("keeps a partial list clickable, since its main deck is there", () => {
    const summary = toMetaDeckSummary(deckRow({ listStatus: "partial" }), IMAGES);
    expect(summary.listStatus).toBe("partial");
    expect(summary.shareToken).toBe("aB3dE5gH7jK9");
  });

  it("names the Legend for its champion and carries the slug the tile links to", () => {
    const summary = toMetaDeckSummary(
      deckRow({
        legendName: "Emperor of the Sands",
        legendSlug: "emperor-of-the-sands",
        legendTags: ["Azir"],
      }),
      IMAGES,
    );
    expect(summary.legendName).toBe("Azir, Emperor of the Sands");
    expect(summary.legendSlug).toBe("emperor-of-the-sands");
  });

  it("leaves the legend's name and slug null for a deck with no legend", () => {
    const summary = toMetaDeckSummary(
      deckRow({ legendCardId: null, legendName: null, legendSlug: null, legendTypes: null }),
      IMAGES,
    );
    expect(summary.legendName).toBeNull();
    expect(summary.legendSlug).toBeNull();
    expect(summary.legendImageId).toBeNull();
  });
});

describe("toMetaDeckContext", () => {
  const row: MetaDeckContextRow = {
    playerId: "3f7a1c2e-0000-7000-8000-0000000000c1",
    listStatus: "full",
    playerName: "Nova",
    sourceIdentity: "u347713",
    rank: 4,
    rankIsTier: false,
    wins: 4,
    losses: 2,
    draws: null,
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    eventTier: "local",
    eventCountry: "DE",
    eventPlayerCount: 128,
  };

  it("nests the event, keeps an absent draw count null, and credits nobody by default", () => {
    expect(toMetaDeckContext(row, [])).toEqual({
      event: {
        slug: "summoner-skirmish-berlin",
        name: "Summoner Skirmish Berlin",
        eventDate: "2026-08-01",
        format: "constructed",
        tier: "local",
        country: "DE",
        playerCount: 128,
      },
      listStatus: "full",
      playerName: "Nova",
      playerKey: "u347713",
      rank: 4,
      rankIsTier: false,
      wins: 4,
      losses: 2,
      draws: null,
      contributors: [],
    });
  });

  it("prints this deck's contributors as plain names, never as user ids", () => {
    const meta = toMetaDeckContext(row, [
      contributorRow(),
      contributorRow({ userId: "user-2", displayName: "Rell" }),
    ]);
    expect(meta.contributors).toEqual(["Nova", "Rell"]);
    expect(JSON.stringify(meta)).not.toContain("user-1");
  });

  it("folds the source identity into a page key, and leaves a hand-entered row without one", () => {
    expect(toMetaDeckContext({ ...row, sourceIdentity: "pn乌冬#2" }, []).playerKey).toBe("pn乌冬");
    expect(toMetaDeckContext({ ...row, sourceIdentity: null }, []).playerKey).toBeNull();
  });

  it("keeps the standings row's own id off the deck page", () => {
    expect(toMetaDeckContext(row, [])).not.toHaveProperty("playerId");
  });

  it("prints a tier-only finish as such", () => {
    const meta = toMetaDeckContext({ ...row, rank: 8, rankIsTier: true }, []);
    expect(meta.rank).toBe(8);
    expect(meta.rankIsTier).toBe(true);
  });

  it("carries the list status through, so the page can flag an incomplete list", () => {
    expect(toMetaDeckContext({ ...row, listStatus: "partial" }, []).listStatus).toBe("partial");
  });

  it("leaves the field size null when no source reported one", () => {
    expect(toMetaDeckContext({ ...row, eventPlayerCount: null }, []).event.playerCount).toBeNull();
  });
});

describe("toAdminMetaEvent", () => {
  it("exposes every stored column plus both counts", () => {
    expect(toAdminMetaEvent(eventRow(), [])).toEqual({
      id: "3f7a1c2e-0000-7000-8000-000000000001",
      slug: "summoner-skirmish-berlin",
      name: "Summoner Skirmish Berlin",
      eventDate: "2026-08-01",
      format: "constructed",
      playerCount: 64,
      organizer: "LGS Berlin",
      notes: "Top 8 lists only.",
      tier: "local",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      playerRowCount: 64,
      deckCount: 8,
      sources: [],
    });
  });

  it("lists the citations feeding the event, in promotion order", () => {
    const citation = (provider: string, externalId: string, priority: number) => ({
      id: `src-${externalId}`,
      metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
      provider,
      externalId,
      label: provider,
      sourceUrl: null,
      priority,
      contributes: true,
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
    });

    const event = toAdminMetaEvent(eventRow(), [
      citation("uvsgames", "evt-1", 0),
      citation("usersubmission", "sub-1", 1),
    ]);

    expect(event.sources).toEqual([
      { id: "src-evt-1", provider: "uvsgames", externalId: "evt-1", priority: 0 },
      { id: "src-sub-1", provider: "usersubmission", externalId: "sub-1", priority: 1 },
    ]);
  });
});

describe("toAdminMetaPlayer", () => {
  it("maps the admin row straight through, minus the display-name parts", () => {
    const row: AdminMetaPlayerRow = { ...playerRow(), deckFormat: "constructed", cardCount: 40 };
    const presented = toAdminMetaPlayer(row);

    expect(presented).toMatchObject({
      id: row.id,
      playerName: row.playerName,
      legendCardId: row.legendCardId,
      legendName: row.legendName,
      deckFormat: "constructed",
      cardCount: 40,
    });
    for (const field of ["legendSlug", "legendTypes", "legendTags", "championSlug"]) {
      expect(presented).not.toHaveProperty(field);
    }
  });

  it("keeps the canonical name of a Legend, which is the field the admin edits", () => {
    const row: AdminMetaPlayerRow = {
      ...playerRow({ legendName: "Emperor of the Sands", legendTags: ["Azir"] }),
      deckFormat: "constructed",
      cardCount: 40,
    };
    expect(toAdminMetaPlayer(row).legendName).toBe("Emperor of the Sands");
  });

  it("keeps an empty deck's card count at zero", () => {
    const row: AdminMetaPlayerRow = {
      ...playerRow({ deckName: "Placeholder", playerName: "Ekko" }),
      deckFormat: "constructed",
      cardCount: 0,
    };
    expect(toAdminMetaPlayer(row).cardCount).toBe(0);
  });

  it("reports a standings-only entry with every deck field null", () => {
    const row: AdminMetaPlayerRow = {
      ...playerRow({
        rank: 8,
        rankIsTier: true,
        deckId: null,
        deckName: null,
        shareToken: null,
        listStatus: "none",
      }),
      deckFormat: null,
      cardCount: 0,
    };
    const player = toAdminMetaPlayer(row);
    expect(player.deckId).toBeNull();
    expect(player.shareToken).toBeNull();
    expect(player.deckName).toBeNull();
    expect(player.deckFormat).toBeNull();
    expect(player.listStatus).toBe("none");
    expect(player.legendCardId).toBe("legend-1");
  });
});

function submissionRow(overrides: Partial<MetaSubmissionRow> = {}): MetaSubmissionRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-0000000000b1",
    userId: "user-1",
    provider: "usersubmission",
    externalId: "20260815-1200--user-1--abcdef12",
    playerOverlayId: null,
    metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    eventName: "Summoner Skirmish Berlin",
    playerName: "Nova",
    kind: "new_list",
    fieldEdits: null,
    note: "Top 8 list from the stream.",
    status: "pending",
    resolutionReason: null,
    resolutionNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
    acceptedDeckId: null,
    createdAt: new Date("2026-08-15T12:00:00.000Z"),
    updatedAt: new Date("2026-08-15T12:00:00.000Z"),
    ...overrides,
  };
}

describe("toMetaSubmission", () => {
  it("serializes the instants and keeps a pending row's outcome empty", () => {
    const response = toMetaSubmission(submissionRow(), null);
    expect(response.createdAt).toBe("2026-08-15T12:00:00.000Z");
    expect(response.resolvedAt).toBeNull();
    expect(response.status).toBe("pending");
  });

  it("carries the outcome an admin wrote", () => {
    const response = toMetaSubmission(
      submissionRow({
        status: "already_correct",
        resolutionReason: "already_correct",
        resolutionNote: "We already had this list.",
        resolvedAt: new Date("2026-08-16T09:30:00.000Z"),
      }),
      null,
    );
    expect(response.status).toBe("already_correct");
    expect(response.resolutionReason).toBe("already_correct");
    expect(response.resolvedAt).toBe("2026-08-16T09:30:00.000Z");
  });

  it("carries the archived deck's permalink, never its id", () => {
    const response = toMetaSubmission(
      submissionRow({
        status: "accepted",
        acceptedDeckId: "3f7a1c2e-0000-7000-8000-00000000000d",
        resolvedAt: new Date("2026-08-16T09:30:00.000Z"),
      }),
      "abc123",
    );
    expect(response.acceptedDeckToken).toBe("abc123");
    expect(response).not.toHaveProperty("acceptedDeckId");
  });

  it("keeps the staging details off the wire", () => {
    const response = toMetaSubmission(submissionRow(), null);
    expect(response).not.toHaveProperty("playerOverlayId");
    expect(response).not.toHaveProperty("provider");
    expect(response).not.toHaveProperty("externalId");
    expect(response).not.toHaveProperty("userId");
  });
});

describe("toAdminMetaSubmission", () => {
  it("names the outcome reason as the admin screen reads it", () => {
    const response = toAdminMetaSubmission(
      submissionRow({
        status: "rejected",
        resolutionReason: "unverified",
        resolutionNote: "No source for this list.",
        resolvedAt: new Date("2026-08-16T09:30:00.000Z"),
      }),
    );
    expect(response.reason).toBe("unverified");
    expect(response.resolutionNote).toBe("No source for this list.");
    expect(response.resolvedAt).toBe("2026-08-16T09:30:00.000Z");
  });

  it("leaves the submitter's identity to the overlay beside it", () => {
    const response = toAdminMetaSubmission(submissionRow());
    expect(response).not.toHaveProperty("userId");
    expect(response).not.toHaveProperty("playerOverlayId");
    expect(response.status).toBe("pending");
    expect(response.createdAt).toBe("2026-08-15T12:00:00.000Z");
  });
});

function archiveLegendRow(overrides: Partial<MetaArchiveLegendRow> = {}): MetaArchiveLegendRow {
  return {
    cardId: "3f7a1c2e-0000-7000-8000-00000000000e",
    name: "Heart of the Tempest",
    slug: "heart-of-the-tempest",
    types: ["legend"],
    tags: ["Kennen"],
    domains: ["chaos", "order"],
    ...overrides,
  };
}

function legendFinishRow(overrides: Partial<MetaLegendFinishRow> = {}): MetaLegendFinishRow {
  return {
    playerId: "3f7a1c2e-0000-7000-8000-00000000000f",
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    sourceIdentity: "pn乌冬#2",
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    eventSlug: "summoner-skirmish-2026",
    eventName: "Summoner Skirmish",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    eventTier: "local",
    eventCountry: "DE",
    eventPlayerCount: 64,
    ...overrides,
  };
}

describe("toMetaLegendSummary", () => {
  it("names the legend the way players say it and keys it on champion plus card slug", () => {
    const summary = toMetaLegendSummary(
      archiveLegendRow(),
      new Map([["3f7a1c2e-0000-7000-8000-00000000000e", "img-1"]]),
      [],
    );
    expect(summary.slug).toBe("kennen-heart-of-the-tempest");
    expect(summary.legend).toEqual({
      cardId: "3f7a1c2e-0000-7000-8000-00000000000e",
      name: "Kennen, Heart of the Tempest",
      slug: "heart-of-the-tempest",
      imageId: "img-1",
      domains: ["chaos", "order"],
      archiveSlug: "kennen-heart-of-the-tempest",
    });
  });

  it("renders a legend with no artwork and no domains rather than dropping it", () => {
    const summary = toMetaLegendSummary(
      archiveLegendRow({ domains: null, types: null, tags: null }),
      new Map(),
      [],
    );
    expect(summary.legend.imageId).toBeNull();
    expect(summary.legend.domains).toEqual([]);
    expect(summary.legend.name).toBe("Heart of the Tempest");
    expect(summary.slug).toBe("heart-of-the-tempest");
  });

  it("carries each event record as archive facts, dropping the join key", () => {
    const summary = toMetaLegendSummary(archiveLegendRow(), new Map(), [
      {
        legendCardId: "3f7a1c2e-0000-7000-8000-00000000000e",
        eventSlug: "summoner-skirmish-berlin",
        bestRank: 2,
        rankIsTier: true,
        finishes: 4,
        decklists: 3,
        won: false,
      },
    ]);
    expect(summary.records).toEqual([
      {
        eventSlug: "summoner-skirmish-berlin",
        bestRank: 2,
        rankIsTier: true,
        finishes: 4,
        decklists: 3,
        won: false,
      },
    ]);
  });
});

describe("archiveLegendSlug", () => {
  it("agrees with the slug the summary carries", () => {
    const row = archiveLegendRow();
    expect(archiveLegendSlug(row)).toBe(toMetaLegendSummary(row, new Map(), []).slug);
  });

  it("keeps two legends of one champion apart", () => {
    expect(
      archiveLegendSlug(
        archiveLegendRow({ name: "Wuju Master", slug: "wuju-master", tags: ["Master Yi"] }),
      ),
    ).toBe("master-yi-wuju-master");
    expect(
      archiveLegendSlug(
        archiveLegendRow({
          name: "Wuju Bladesman, Starter",
          slug: "wuju-bladesman-starter",
          tags: ["Master Yi"],
        }),
      ),
    ).toBe("master-yi-wuju-bladesman-starter");
  });
});

describe("toMetaLegendFinish", () => {
  it("carries the event facts a row prints without leaving the legend's page", () => {
    const finish = toMetaLegendFinish(legendFinishRow());
    expect(finish.event).toEqual({
      slug: "summoner-skirmish-2026",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      playerCount: 64,
    });
    expect(finish).toMatchObject({ rank: 1, playerName: "Renata", listStatus: "none" });
  });

  it("offers no decklist for a standings-only entry", () => {
    const finish = toMetaLegendFinish(legendFinishRow());
    expect(finish.shareToken).toBeNull();
    expect(finish.listStatus).toBe("none");
  });

  it("folds the source identity into a page key, and leaves a hand-entered row without one", () => {
    expect(toMetaLegendFinish(legendFinishRow()).playerKey).toBe("pn乌冬");
    expect(toMetaLegendFinish(legendFinishRow({ sourceIdentity: null })).playerKey).toBeNull();
  });

  it("keeps a record the source never published null rather than inventing zeros", () => {
    const finish = toMetaLegendFinish(
      legendFinishRow({ wins: null, losses: null, draws: null, eventPlayerCount: null }),
    );
    expect(finish.wins).toBeNull();
    expect(finish.losses).toBeNull();
    expect(finish.draws).toBeNull();
    expect(finish.event.playerCount).toBeNull();
  });
});

function playerFinishRow(overrides: Partial<MetaPlayerFinishRow> = {}): MetaPlayerFinishRow {
  return {
    playerId: "3f7a1c2e-0000-7000-8000-00000000000f",
    playerName: "Renata",
    rank: 1,
    rankIsTier: false,
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    legendCardId: "legend-1",
    legendName: "Jinx",
    legendSlug: "jinx",
    legendTypes: ["legend"],
    legendTags: [],
    legendDomains: ["chaos", "fury"],
    eventSlug: "summoner-skirmish-2026",
    eventName: "Summoner Skirmish",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    eventTier: "local",
    eventCountry: "DE",
    eventPlayerCount: 64,
    ...overrides,
  };
}

describe("toMetaPlayerFinish", () => {
  it("names the legend the player brought, with its artwork and archive key", () => {
    expect(toMetaPlayerFinish(playerFinishRow(), IMAGES).legend).toEqual({
      cardId: "legend-1",
      name: "Jinx",
      slug: "jinx",
      imageId: "image-legend",
      domains: ["chaos", "fury"],
      archiveSlug: "jinx",
    });
  });

  it("composes the archive key from the champion tag the row carries", () => {
    const finish = toMetaPlayerFinish(
      playerFinishRow({
        legendName: "Loose Cannon",
        legendSlug: "loose-cannon",
        legendTags: ["Jinx"],
      }),
      IMAGES,
    );
    expect(finish.legend?.name).toBe("Jinx, Loose Cannon");
    expect(finish.legend?.archiveSlug).toBe("jinx-loose-cannon");
  });

  it("keeps a finish whose legend the archive never learned", () => {
    const finish = toMetaPlayerFinish(
      playerFinishRow({ legendCardId: null, legendName: null, legendSlug: null }),
      IMAGES,
    );
    expect(finish.legend).toBeNull();
    expect(finish.rank).toBe(1);
  });

  it("carries the event facts a row prints without leaving the player's page", () => {
    expect(toMetaPlayerFinish(playerFinishRow(), IMAGES).event).toEqual({
      slug: "summoner-skirmish-2026",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      tier: "local",
      country: "DE",
      playerCount: 64,
    });
  });

  it("leaves the player's own name off a page already titled with it", () => {
    expect(toMetaPlayerFinish(playerFinishRow(), IMAGES)).not.toHaveProperty("playerName");
  });

  it("offers no decklist for a standings-only entry", () => {
    const finish = toMetaPlayerFinish(playerFinishRow(), IMAGES);
    expect(finish.shareToken).toBeNull();
    expect(finish.listStatus).toBe("none");
  });

  it("keeps a record the source never published null rather than inventing zeros", () => {
    const finish = toMetaPlayerFinish(
      playerFinishRow({ wins: null, losses: null, draws: null, eventPlayerCount: null }),
      IMAGES,
    );
    expect(finish.wins).toBeNull();
    expect(finish.event.playerCount).toBeNull();
  });
});

describe("toAdminMetaEventCorrection", () => {
  const event = {
    id: "3f7a1c2e-0000-7000-8000-000000000001",
    slug: "summoner-skirmish-berlin",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-15",
    format: "constructed",
    playerCount: 64,
    organizer: "Rift Games Berlin",
    location: "Ionia Hall, Berlin",
    country: "DE",
  };

  it("pairs the proposed values with the event they would replace", () => {
    const correction = toAdminMetaEventCorrection({
      submission: submissionRow({
        kind: "event_correction",
        playerName: null,
        playerOverlayId: null,
        fieldEdits: { playerCount: 48 },
        note: "The results page lists 48 players.",
      }),
      event,
    });

    expect(correction.fieldEdits).toEqual({ playerCount: 48 });
    expect(correction.event?.playerCount).toBe(64);
    expect(correction.submission.kind).toBe("event_correction");
    expect(correction.submission.playerName).toBeNull();
  });

  it("reads an absent edit set as no proposed values", () => {
    const correction = toAdminMetaEventCorrection({
      submission: submissionRow({
        kind: "event_correction",
        playerName: null,
        fieldEdits: null,
      }),
      event: null,
    });

    expect(correction.fieldEdits).toEqual({});
    expect(correction.event).toBeNull();
  });
});
