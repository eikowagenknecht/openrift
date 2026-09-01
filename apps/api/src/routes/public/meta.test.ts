import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { metaRouter } from "./meta";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockMeta = {
  allEvents: vi.fn(),
  winnersForEvents: vi.fn(),
  eventBySlug: vi.fn(),
  standingsForEvent: vi.fn(),
  matchesForEvent: vi.fn(),
  phasesForEvent: vi.fn(),
  sourcesForEvent: vi.fn(),
  contributorsForEvent: vi.fn(),
  playerCountInScope: vi.fn(),
  deckCountInScope: vi.fn(),
  archiveLegends: vi.fn(),
  archiveLegendEventRecords: vi.fn(),
  finishesForLegend: vi.fn(),
};

const mockCanonicalPrintings = { resolvePrintingMetaForRows: vi.fn() };

const EVENT_ID = "b0000000-0001-4000-a000-000000000001";
const LEGEND_ID = "f0000000-0001-4000-a000-000000000001";
const CHAMPION_ID = "f0000000-0001-4000-a000-000000000002";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { meta: mockMeta, canonicalPrintings: mockCanonicalPrintings } as never);
  await next();
});
registerRouterForTest(app, metaRouter);

/** @returns An event row with its standings and deck counts, as the repo hands it back. */
function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    slug: "summoner-skirmish-2026",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: "Top 8 lists only.",
    tier: "store",
    country: "DE",
    location: "Kartenstraße 1, 10115 Berlin, DE",
    playerRowCount: 0,
    deckCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A standings row with no list attached, which is most of a real field. */
function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p0000000-0001-4000-a000-000000000001",
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: null,
    legendName: null,
    legendSlug: null,
    legendTypes: null,
    legendTags: null,
    legendDomains: null,
    championCardId: null,
    championName: null,
    championSlug: null,
    championDomains: null,
    deckId: null,
    deckName: null,
    shareToken: null,
    listStatus: "none",
    ...overrides,
  };
}

/** @returns A stored citation row. */
function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c0000000-0001-4000-a000-000000000001",
    metaEventId: EVENT_ID,
    provider: "uvsgames",
    externalId: "evt-1",
    label: "uvsgames",
    sourceUrl: "https://example.invalid/uvs",
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockMeta.winnersForEvents.mockResolvedValue([]);
  mockMeta.standingsForEvent.mockResolvedValue([]);
  mockMeta.matchesForEvent.mockResolvedValue([]);
  mockMeta.phasesForEvent.mockResolvedValue([]);
  mockMeta.sourcesForEvent.mockResolvedValue([]);
  mockMeta.contributorsForEvent.mockResolvedValue([]);
  mockMeta.archiveLegends.mockResolvedValue([]);
  mockMeta.archiveLegendEventRecords.mockResolvedValue([]);
  mockMeta.finishesForLegend.mockResolvedValue([]);
  mockCanonicalPrintings.resolvePrintingMetaForRows.mockResolvedValue([]);
});

describe("GET /meta/events/{slug}", () => {
  it("prints every citation in the order the repo returned them", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.sourcesForEvent.mockResolvedValue([
      sourceRow(),
      sourceRow({
        id: "c0000000-0001-4000-a000-000000000002",
        provider: null,
        externalId: null,
        label: "Twitch VOD",
        sourceUrl: "https://example.invalid/vod",
      }),
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.event.sources.map((s: { label: string }) => s.label)).toEqual([
      "uvsgames",
      "Twitch VOD",
    ]);
    // The single `sourceUrl` column is gone (migration 255).
    expect(json.event.sourceUrl).toBeUndefined();
  });

  it("names each contributor once, resolved, with no user id on the wire", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.contributorsForEvent.mockResolvedValue([
      { metaEventId: EVENT_ID, userId: "user-7", displayName: "Skarner Fan" },
      { metaEventId: EVENT_ID, userId: "user-9", displayName: "Ziggs Enjoyer" },
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.event.contributors).toEqual(["Skarner Fan", "Ziggs Enjoyer"]);
    expect(JSON.stringify(json.event)).not.toContain("user-7");
  });

  it("shows no contributor line when everyone who helped is hidden", async () => {
    // The repo drops anyone on `hidden`, so an empty list is the normal answer
    // for an event nobody has opted in for.
    mockMeta.eventBySlug.mockResolvedValue(eventRow());

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.event.contributors).toEqual([]);
    expect(json.event.sources).toEqual([]);
  });

  it("returns the whole standings table, deckless entries included", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow({ playerRowCount: 3, deckCount: 1 }));
    mockMeta.standingsForEvent.mockResolvedValue([
      playerRow({
        deckId: "d0000000-0001-4000-a000-000000000001",
        deckName: "Renata Control",
        shareToken: "tok-1",
        listStatus: "full",
      }),
      playerRow({ id: "p0000000-0001-4000-a000-000000000002", rank: 2, playerName: "Ekko" }),
      playerRow({
        id: "p0000000-0001-4000-a000-000000000003",
        rank: 3,
        playerName: "Jinx",
        wins: null,
        losses: null,
        draws: null,
      }),
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.players).toHaveLength(3);
    expect(json.players[0]).toMatchObject({
      deckId: "d0000000-0001-4000-a000-000000000001",
      deckName: "Renata Control",
      shareToken: "tok-1",
      listStatus: "full",
    });
    expect(json.players[1]).toMatchObject({
      playerName: "Ekko",
      deckId: null,
      shareToken: null,
      listStatus: "none",
    });
    expect(json.players[2]).toMatchObject({ wins: null, losses: null, draws: null });
    expect(json.event.playerRowCount).toBe(3);
    expect(json.event.deckCount).toBe(1);
  });

  it("says whether a rank is an exact standing or a cut bucket", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.standingsForEvent.mockResolvedValue([
      playerRow({ rank: 1, rankIsTier: false }),
      playerRow({
        id: "p0000000-0001-4000-a000-000000000002",
        rank: 8,
        rankIsTier: true,
        playerName: "Ekko",
      }),
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.players.map((p: { rankIsTier: boolean }) => p.rankIsTier)).toEqual([false, true]);
  });

  it("serves the round-by-round matches keyed to the standings rows", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.matchesForEvent.mockResolvedValue([
      {
        id: "m0000000-0000-4000-a000-000000000001",
        metaEventId: "e0000000-0000-4000-a000-000000000001",
        phaseOrder: 0,
        roundNumber: 1,
        tableNumber: 4,
        isBye: false,
        isDraw: false,
        player1Id: "p0000000-0001-4000-a000-000000000001",
        player2Id: "p0000000-0001-4000-a000-000000000002",
        winnerId: "p0000000-0001-4000-a000-000000000001",
        gamesWonP1: 2,
        gamesWonP2: 1,
        createdAt: new Date("2026-08-18T10:00:00.000Z"),
        updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      },
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.matches).toEqual([
      {
        phaseOrder: 0,
        roundNumber: 1,
        tableNumber: 4,
        isBye: false,
        isDraw: false,
        player1Id: "p0000000-0001-4000-a000-000000000001",
        player2Id: "p0000000-0001-4000-a000-000000000002",
        winnerId: "p0000000-0001-4000-a000-000000000001",
        gamesWonP1: 2,
        gamesWonP2: 1,
      },
    ]);
  });

  it("serves the phases those rounds belong to, so a cut is not guessed from their shape", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.phasesForEvent.mockResolvedValue([
      {
        id: "h0000000-0000-4000-a000-000000000001",
        metaEventId: EVENT_ID,
        phaseOrder: 0,
        name: "Phase 1",
        roundType: "SWISS",
        roundCount: 8,
        rankRequired: null,
        maxGameWins: 2,
        createdAt: new Date("2026-08-18T10:00:00.000Z"),
        updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      },
      {
        id: "h0000000-0000-4000-a000-000000000002",
        metaEventId: EVENT_ID,
        phaseOrder: 1,
        name: "Phase 3",
        roundType: "RANKED_SINGLE_ELIMINATION",
        roundCount: 3,
        rankRequired: 8,
        maxGameWins: 2,
        createdAt: new Date("2026-08-18T10:00:00.000Z"),
        updatedAt: new Date("2026-08-18T10:00:00.000Z"),
      },
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.phases).toEqual([
      { phaseOrder: 0, name: "Phase 1", roundType: "SWISS", roundCount: 8, rankRequired: null },
      {
        phaseOrder: 1,
        name: "Phase 3",
        roundType: "RANKED_SINGLE_ELIMINATION",
        roundCount: 3,
        rankRequired: 8,
      },
    ]);
  });

  it("resolves every legend and champion image in one batch", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.standingsForEvent.mockResolvedValue([
      playerRow({
        legendCardId: LEGEND_ID,
        legendName: "Azir",
        legendSlug: "azir",
        legendDomains: ["order", "calm"],
        championCardId: CHAMPION_ID,
        championName: "Jinx",
        championSlug: "jinx",
        championDomains: ["chaos"],
      }),
      playerRow({
        id: "p0000000-0001-4000-a000-000000000002",
        rank: 2,
        playerName: "Ekko",
        legendCardId: LEGEND_ID,
        legendName: "Azir",
        legendSlug: "azir",
      }),
    ]);
    mockCanonicalPrintings.resolvePrintingMetaForRows.mockResolvedValue([
      { imageId: "img-legend" },
      { imageId: null },
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(mockCanonicalPrintings.resolvePrintingMetaForRows).toHaveBeenCalledTimes(1);
    // Deduplicated, and asking for each card's canonical default rather than a
    // particular printing of it.
    expect(mockCanonicalPrintings.resolvePrintingMetaForRows).toHaveBeenCalledWith([
      { cardId: LEGEND_ID, preferredPrintingId: null },
      { cardId: CHAMPION_ID, preferredPrintingId: null },
    ]);
    expect(json.players[0].legend).toEqual({
      cardId: LEGEND_ID,
      name: "Azir",
      slug: "azir",
      imageId: "img-legend",
      domains: ["order", "calm"],
      archiveSlug: "azir",
    });
    expect(json.players[0].champion).toEqual({
      cardId: CHAMPION_ID,
      name: "Jinx",
      slug: "jinx",
      imageId: null,
      domains: ["chaos"],
      archiveSlug: null,
    });
    expect(json.players[1].champion).toBeNull();
  });

  it("names a Legend for its champion, so a standings line reads the way players say it", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.standingsForEvent.mockResolvedValue([
      playerRow({
        legendCardId: LEGEND_ID,
        legendName: "Emperor of the Sands",
        legendSlug: "emperor-of-the-sands",
        legendTypes: ["legend"],
        legendTags: ["Azir"],
      }),
    ]);
    mockCanonicalPrintings.resolvePrintingMetaForRows.mockResolvedValue([
      { imageId: "img-legend" },
    ]);

    const res = await app.request("/api/v1/meta/events/summoner-skirmish-2026");

    const json = await readJson(res);
    expect(json.players[0].legend).toEqual({
      cardId: LEGEND_ID,
      name: "Azir, Emperor of the Sands",
      slug: "emperor-of-the-sands",
      imageId: "img-legend",
      domains: [],
      archiveSlug: "azir-emperor-of-the-sands",
    });
  });

  it("404s an unknown slug without reading citations or contributors", async () => {
    mockMeta.eventBySlug.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/meta/events/no-such-event");

    expect(res.status).toBe(404);
    expect(mockMeta.standingsForEvent).not.toHaveBeenCalled();
    expect(mockMeta.sourcesForEvent).not.toHaveBeenCalled();
    expect(mockMeta.contributorsForEvent).not.toHaveBeenCalled();
  });
});

describe("GET /meta/events", () => {
  it("leaves the long-form fields off the list rows", async () => {
    mockMeta.allEvents.mockResolvedValue([eventRow({ playerRowCount: 64, deckCount: 8 })]);

    const res = await app.request("/api/v1/meta/events");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.events[0].slug).toBe("summoner-skirmish-2026");
    expect(json.events[0].playerRowCount).toBe(64);
    expect(json.events[0].deckCount).toBe(8);
    expect(json.events[0].notes).toBeUndefined();
    expect(json.events[0].sources).toBeUndefined();
  });

  it("names each event's winner inline, with the legend's artwork", async () => {
    mockMeta.allEvents.mockResolvedValue([eventRow({ playerRowCount: 64, deckCount: 8 })]);
    mockMeta.winnersForEvents.mockResolvedValue([
      {
        ...playerRow({ legendCardId: LEGEND_ID, legendName: "Jinx", legendSlug: "jinx" }),
        metaEventId: EVENT_ID,
      },
    ]);
    mockCanonicalPrintings.resolvePrintingMetaForRows.mockResolvedValue([{ imageId: "img-jinx" }]);

    const res = await app.request("/api/v1/meta/events");

    const json = await readJson(res);
    expect(json.events[0].winners).toHaveLength(1);
    expect(json.events[0].winners[0]).toMatchObject({
      playerName: "Renata",
      wins: 5,
      losses: 1,
      draws: 0,
      legend: { slug: "jinx", imageId: "img-jinx" },
    });
  });

  it("names both players when the source published two first places", async () => {
    mockMeta.allEvents.mockResolvedValue([eventRow()]);
    mockMeta.winnersForEvents.mockResolvedValue([
      { ...playerRow({ playerName: "Ashe" }), metaEventId: EVENT_ID },
      {
        ...playerRow({ id: "p0000000-0001-4000-a000-000000000002", playerName: "Zed" }),
        metaEventId: EVENT_ID,
      },
    ]);

    const res = await app.request("/api/v1/meta/events");

    const json = await readJson(res);
    expect(json.events[0].winners.map((entry: { playerName: string }) => entry.playerName)).toEqual(
      ["Ashe", "Zed"],
    );
  });

  it("names no winner for an event whose standings have not arrived", async () => {
    mockMeta.allEvents.mockResolvedValue([eventRow()]);

    const res = await app.request("/api/v1/meta/events");

    const json = await readJson(res);
    expect(json.events[0].winners).toEqual([]);
  });
});

/** @returns One legend the archive holds results for, as the repo groups it. */
function legendRow(overrides: Record<string, unknown> = {}) {
  return {
    cardId: LEGEND_ID,
    name: "Heart of the Tempest",
    slug: "heart-of-the-tempest",
    types: ["legend"],
    tags: ["Kennen"],
    domains: ["chaos", "order"],
    ...overrides,
  };
}

/** @returns One archived finish for a legend, as the repo returns it. */
function finishRow(overrides: Record<string, unknown> = {}) {
  return {
    playerId: "p0000000-0001-4000-a000-000000000001",
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

describe("GET /meta/legends", () => {
  it("keys each legend on its champion and its card slug, ordered by the name a reader sees", async () => {
    mockMeta.archiveLegends.mockResolvedValue([
      legendRow(),
      legendRow({
        cardId: "f0000000-0001-4000-a000-000000000009",
        name: "Emperor of the Sands",
        slug: "emperor-of-the-sands",
        tags: ["Azir"],
      }),
    ]);

    const res = await app.request("/api/v1/meta/legends");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.legends.map((entry: { slug: string }) => entry.slug)).toEqual([
      "azir-emperor-of-the-sands",
      "kennen-heart-of-the-tempest",
    ]);
    expect(json.legends[1].legend).toMatchObject({
      name: "Kennen, Heart of the Tempest",
      slug: "heart-of-the-tempest",
      domains: ["chaos", "order"],
    });
  });

  it("hands each legend its own event records and nothing of its neighbours'", async () => {
    const azirId = "f0000000-0001-4000-a000-000000000009";
    mockMeta.archiveLegends.mockResolvedValue([
      legendRow(),
      legendRow({
        cardId: azirId,
        name: "Emperor of the Sands",
        slug: "emperor-of-the-sands",
        tags: ["Azir"],
      }),
    ]);
    mockMeta.archiveLegendEventRecords.mockResolvedValue([
      {
        legendCardId: LEGEND_ID,
        eventSlug: "summoner-skirmish-2026",
        bestRank: 4,
        rankIsTier: false,
        finishes: 2,
        decklists: 1,
        won: false,
      },
      {
        legendCardId: azirId,
        eventSlug: "regional-lyon",
        bestRank: 1,
        rankIsTier: false,
        finishes: 1,
        decklists: 1,
        won: true,
      },
    ]);

    const res = await app.request("/api/v1/meta/legends");

    const json = await readJson(res);
    expect(json.legends[0].records).toEqual([
      {
        eventSlug: "regional-lyon",
        bestRank: 1,
        rankIsTier: false,
        finishes: 1,
        decklists: 1,
        won: true,
      },
    ]);
    expect(json.legends[1].records).toEqual([
      {
        eventSlug: "summoner-skirmish-2026",
        bestRank: 4,
        rankIsTier: false,
        finishes: 2,
        decklists: 1,
        won: false,
      },
    ]);
  });

  it("returns nothing for an archive with no standings yet", async () => {
    const res = await app.request("/api/v1/meta/legends");

    const json = await readJson(res);
    expect(json.legends).toEqual([]);
  });
});

describe("GET /meta/legends/{slug}", () => {
  it("returns every archived finish for the legend the slug names", async () => {
    mockMeta.archiveLegends.mockResolvedValue([legendRow()]);
    mockMeta.finishesForLegend.mockResolvedValue([
      finishRow({ shareToken: "tok-1", listStatus: "full" }),
      finishRow({
        playerId: "p0000000-0001-4000-a000-000000000002",
        rank: 4,
        playerName: "Ekko",
        eventTier: "premier",
      }),
    ]);

    const res = await app.request("/api/v1/meta/legends/kennen-heart-of-the-tempest");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(mockMeta.finishesForLegend).toHaveBeenCalledWith(LEGEND_ID);
    expect(json.slug).toBe("kennen-heart-of-the-tempest");
    expect(json.legend.name).toBe("Kennen, Heart of the Tempest");
    expect(json.finishes).toHaveLength(2);
    expect(json.finishes[0]).toMatchObject({ rank: 1, shareToken: "tok-1", listStatus: "full" });
    expect(json.finishes[1].event).toMatchObject({
      slug: "summoner-skirmish-2026",
      tier: "premier",
      country: "DE",
      playerCount: 64,
    });
  });

  it("separates two legends of one champion by their card slugs", async () => {
    mockMeta.archiveLegends.mockResolvedValue([
      legendRow({ name: "Wuju Master", slug: "wuju-master", tags: ["Master Yi"] }),
      legendRow({
        cardId: "f0000000-0001-4000-a000-000000000003",
        name: "Wuju Bladesman, Starter",
        slug: "wuju-bladesman-starter",
        tags: ["Master Yi"],
      }),
    ]);

    const res = await app.request("/api/v1/meta/legends/master-yi-wuju-bladesman-starter");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(mockMeta.finishesForLegend).toHaveBeenCalledWith("f0000000-0001-4000-a000-000000000003");
    expect(json.legend.name).toBe("Master Yi, Wuju Bladesman");
  });

  it("404s a slug no archived legend answers to", async () => {
    mockMeta.archiveLegends.mockResolvedValue([legendRow()]);

    const res = await app.request("/api/v1/meta/legends/teemo-swift-scout");

    expect(res.status).toBe(404);
    expect(mockMeta.finishesForLegend).not.toHaveBeenCalled();
  });

  it("resolves the key a standings row hands its legend link", async () => {
    mockMeta.eventBySlug.mockResolvedValue(eventRow());
    mockMeta.standingsForEvent.mockResolvedValue([
      playerRow({
        legendCardId: LEGEND_ID,
        legendName: "Heart of the Tempest",
        legendSlug: "heart-of-the-tempest",
        legendTypes: ["legend"],
        legendTags: ["Kennen"],
      }),
    ]);
    mockMeta.archiveLegends.mockResolvedValue([legendRow()]);

    const standings = await readJson(
      await app.request("/api/v1/meta/events/summoner-skirmish-2026"),
    );
    const linked = standings.players[0].legend.archiveSlug as string;

    const res = await app.request(`/api/v1/meta/legends/${linked}`);
    expect(res.status).toBe(200);
    const legend = await readJson(res);
    expect(legend.slug).toBe(linked);
  });

  it("returns a legend with no finishes rather than 404ing it", async () => {
    mockMeta.archiveLegends.mockResolvedValue([legendRow({ deckCount: 0 })]);

    const res = await app.request("/api/v1/meta/legends/kennen-heart-of-the-tempest");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.finishes).toEqual([]);
  });
});

describe("GET /meta/counts", () => {
  it("returns both scope counts and forwards the event-level filters", async () => {
    mockMeta.playerCountInScope.mockResolvedValue(240);
    mockMeta.deckCountInScope.mockResolvedValue(12);

    const res = await app.request("/api/v1/meta/counts?format=constructed");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ totalPlayers: 240, decksWithMainDeck: 12 });
    expect(mockMeta.playerCountInScope).toHaveBeenCalledWith({ format: "constructed" });
    expect(mockMeta.deckCountInScope).toHaveBeenCalledWith({ format: "constructed" });
  });
});
