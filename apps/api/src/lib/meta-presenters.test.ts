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
} from "../repositories/meta.js";
import {
  archiveLegendSlug,
  toMetaLegendFinish,
  toMetaLegendSummary,
  toAdminMetaEvent,
  toAdminMetaPlayer,
  toAdminMetaSubmission,
  toMetaDeckContext,
  toMetaDeckSummary,
  toMetaEventDetail,
  toMetaEventMatch,
  toMetaEventPhase,
  toMetaEventPlayer,
  toMetaEventSource,
  toMetaEventSummary,
  toMetaEventWinner,
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
    tier: "store",
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
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
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
      tier: "store",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      playerCount: 64,
      organizer: "LGS Berlin",
      playerRowCount: 64,
      deckCount: 8,
      winners: [],
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

  it("carries every winner it was handed", () => {
    const summary = toMetaEventSummary(eventRow(), [
      toMetaEventWinner(playerRow(), IMAGES),
      toMetaEventWinner(playerRow({ playerName: "Rell" }), IMAGES),
    ]);
    expect(summary.winners.map((entry) => entry.playerName)).toEqual(["Nova", "Rell"]);
  });

  it("has no winners for an event whose standings have not arrived", () => {
    expect(toMetaEventSummary(eventRow()).winners).toEqual([]);
  });
});

describe("toMetaEventWinner", () => {
  it("names the winner's legend the way players say it, with its artwork", () => {
    expect(toMetaEventWinner(playerRow(), IMAGES)).toEqual({
      playerName: "Nova",
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

  it("gives the winner's legend its real domains, so an inline winner draws its runes", () => {
    const winner = toMetaEventWinner(playerRow({ legendDomains: ["order"] }), IMAGES);
    expect(winner.legend?.domains).toEqual(["order"]);
  });

  it("draws no runes for a legend the aggregates view has not caught up with", () => {
    const winner = toMetaEventWinner(playerRow({ legendDomains: null }), IMAGES);
    expect(winner.legend?.domains).toEqual([]);
  });

  it("keeps the winner when the archive never learned their legend", () => {
    const winner = toMetaEventWinner(playerRow({ legendCardId: null, legendName: null }), IMAGES);
    expect(winner).toMatchObject({ playerName: "Nova", legend: null });
  });

  it("leaves the record null when the source published none", () => {
    const winner = toMetaEventWinner(playerRow({ wins: null, losses: null, draws: null }), IMAGES);
    expect(winner).toMatchObject({ wins: null, losses: null, draws: null });
  });
});

function sourceRow(overrides: Partial<MetaEventSourceRow> = {}): MetaEventSourceRow {
  return {
    id: "3f7a1c2e-0000-7000-8000-0000000000a1",
    metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    provider: "uvsgames",
    externalId: "evt-482",
    label: "uvsgames",
    sourceUrl: "https://example.invalid/skirmish",
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
      tier: "store",
      country: "DE",
      playerCount: 64,
      organizer: "LGS Berlin",
      playerRowCount: 64,
      deckCount: 8,
      winners: [],
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
    });
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
    rank: 4,
    rankIsTier: false,
    wins: 4,
    losses: 2,
    draws: null,
    eventSlug: "summoner-skirmish-berlin",
    eventName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
  };

  it("nests the event, keeps an absent draw count null, and credits nobody by default", () => {
    expect(toMetaDeckContext(row, [])).toEqual({
      event: {
        slug: "summoner-skirmish-berlin",
        name: "Summoner Skirmish Berlin",
        eventDate: "2026-08-01",
        format: "constructed",
      },
      listStatus: "full",
      playerName: "Nova",
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
      tier: "store",
      country: "DE",
      location: "Kartenstraße 1, 10115 Berlin, DE",
      playerRowCount: 64,
      deckCount: 8,
      sources: [],
    });
  });

  it("lists the candidates feeding the event, without their live-event key", () => {
    const event = toAdminMetaEvent(eventRow(), [
      {
        metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
        candidateEventId: "cand-1",
        provider: "uvsgames",
      },
      {
        metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
        candidateEventId: "cand-2",
        provider: "usersubmission",
      },
    ]);

    expect(event.sources).toEqual([
      { candidateEventId: "cand-1", provider: "uvsgames" },
      { candidateEventId: "cand-2", provider: "usersubmission" },
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
    candidateMetaPlayerId: "3f7a1c2e-0000-7000-8000-000000000010",
    metaEventId: "3f7a1c2e-0000-7000-8000-000000000001",
    eventName: "Summoner Skirmish Berlin",
    playerName: "Nova",
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
    const response = toMetaSubmission(submissionRow());
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
    );
    expect(response.status).toBe("already_correct");
    expect(response.resolutionReason).toBe("already_correct");
    expect(response.resolvedAt).toBe("2026-08-16T09:30:00.000Z");
  });

  it("carries the archived deck an accept produced", () => {
    const response = toMetaSubmission(
      submissionRow({
        status: "accepted",
        acceptedDeckId: "3f7a1c2e-0000-7000-8000-00000000000d",
        resolvedAt: new Date("2026-08-16T09:30:00.000Z"),
      }),
    );
    expect(response.acceptedDeckId).toBe("3f7a1c2e-0000-7000-8000-00000000000d");
  });

  it("keeps the staging details off the wire", () => {
    const response = toMetaSubmission(submissionRow());
    expect(response).not.toHaveProperty("candidateMetaPlayerId");
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

  it("leaves the submitter's identity to the candidate row beside it", () => {
    const response = toAdminMetaSubmission(submissionRow());
    expect(response).not.toHaveProperty("userId");
    expect(response).not.toHaveProperty("candidateMetaPlayerId");
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
    deckCount: 3,
    ...overrides,
  };
}

function legendFinishRow(overrides: Partial<MetaLegendFinishRow> = {}): MetaLegendFinishRow {
  return {
    playerId: "3f7a1c2e-0000-7000-8000-00000000000f",
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    wins: 12,
    losses: 1,
    draws: 0,
    shareToken: null,
    listStatus: "none",
    eventSlug: "summoner-skirmish-2026",
    eventName: "Summoner Skirmish",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    eventTier: "store",
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
    expect(summary.deckCount).toBe(3);
  });

  it("renders a legend with no artwork and no domains rather than dropping it", () => {
    const summary = toMetaLegendSummary(
      archiveLegendRow({ domains: null, types: null, tags: null }),
      new Map(),
    );
    expect(summary.legend.imageId).toBeNull();
    expect(summary.legend.domains).toEqual([]);
    expect(summary.legend.name).toBe("Heart of the Tempest");
    expect(summary.slug).toBe("heart-of-the-tempest");
  });

  it("publishes no results number beside a legend", () => {
    const summary = toMetaLegendSummary(archiveLegendRow(), new Map());
    expect(Object.keys(summary)).toEqual(["slug", "legend", "deckCount"]);
  });
});

describe("archiveLegendSlug", () => {
  it("agrees with the slug the summary carries", () => {
    const row = archiveLegendRow();
    expect(archiveLegendSlug(row)).toBe(toMetaLegendSummary(row, new Map()).slug);
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
      tier: "store",
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
