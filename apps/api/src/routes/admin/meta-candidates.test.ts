import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { playerSourceKey } from "../../services/ingest-meta-overlays.js";
import type * as MetaPromote from "../../services/meta-promote.js";
import { promoteMetaEvent } from "../../services/meta-promote.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminMetaCandidatesRouter } from "./meta-candidates";

// sourceEventFacts stays unmocked because the drift tests assert exactly what
// it computes.
vi.mock("../../services/meta-promote.js", async (importOriginal) => ({
  ...(await importOriginal<typeof MetaPromote>()),
  promoteMetaEvent: vi.fn(() =>
    Promise.resolve({
      metaEventId: "e0000000-0001-4000-a000-000000000001",
      players: 0,
      removedPlayers: 0,
      decks: 0,
      matches: 0,
      phases: 0,
      unresolvedNames: [],
      mergedLines: [],
      errors: [],
    }),
  ),
}));

const mockOverlays = {
  pendingEventOverlays: vi.fn(),
  pendingPlayerOverlays: vi.fn(),
  cardsByOverlayIds: vi.fn(),
  eventOverlayById: vi.fn(),
  insertEventOverlay: vi.fn(),
  updateEventOverlay: vi.fn(),
  deleteEventOverlay: vi.fn(),
  adminEditOverlay: vi.fn(),
  setEventOverlayStatus: vi.fn(),
  playerOverlayById: vi.fn(),
  linkPlayerOverlay: vi.fn(),
  insertPlayerOverlay: vi.fn(),
  updatePlayerOverlay: vi.fn(),
  deletePlayerOverlay: vi.fn(),
  adminPlayerEditOverlay: vi.fn(),
  setPlayerOverlayStatus: vi.fn(),
  acceptedPlayerOverlays: vi.fn(),
  acceptedEventOverlays: vi.fn(),
  ignoreEvent: vi.fn(),
  unignoreEvent: vi.fn(),
  listIgnored: vi.fn(),
  resolveCardName: vi.fn(),
};

const mockMeta = {
  eventById: vi.fn(),
  eventsByIds: vi.fn(),
  playerById: vi.fn(),
  livePlayersByIds: vi.fn(),
  adminPlayersForEvent: vi.fn(),
  eventIdForPlayer: vi.fn(),
  rawStandingsForEvent: vi.fn(),
  renamePlayerDeck: vi.fn(),
  sourcesForEvent: vi.fn(),
  setEventSourcePriority: vi.fn(),
  eventSourceById: vi.fn(),
  setEventSourceContributes: vi.fn(),
};

const mockPlayerLinks = { forEvent: vi.fn(), putMany: vi.fn(), remove: vi.fn() };

const mockCatalog = { cardNamesByIds: vi.fn() };

const mockUvsgames = {
  byKey: vi.fn(),
  formatMappings: vi.fn(),
  templateTiers: vi.fn(),
  settings: vi.fn(),
  playerDisplayNames: vi.fn(),
};
const mockUvsgamesResults = { standings: vi.fn() };
const mockPlayloltcg = { byKey: vi.fn() };
const mockTopdeck = { byKey: vi.fn() };
const mockTopdeckResults = { standings: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const EVENT_OVERLAY_ID = "b0000000-0001-4000-a000-000000000001";
const PLAYER_OVERLAY_ID = "c0000000-0001-4000-a000-000000000001";
const LIVE_EVENT_ID = "e0000000-0001-4000-a000-000000000001";
const LIVE_PLAYER_ID = "f0000000-0001-4000-a000-000000000001";
const CARD_ID = "d0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000002";
const TOPDECK_SOURCE_ID = "e0000000-0001-4000-a000-000000000002";

const mockMetaSubmissions = {
  byPlayerOverlayId: vi.fn(),
  recordAcceptance: vi.fn(),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    meta: mockMeta,
    metaOverlays: mockOverlays,
    metaPlayerLinks: mockPlayerLinks,
    uvsgamesEvents: mockUvsgames,
    uvsgamesResults: mockUvsgamesResults,
    playloltcgEvents: mockPlayloltcg,
    topdeckEvents: mockTopdeck,
    topdeckResults: mockTopdeckResults,
    catalog: mockCatalog,
    metaSubmissions: mockMetaSubmissions,
  } as never);
  await next();
});
registerRouterForTest(app, adminMetaCandidatesRouter);

/** A uvsgames listing row, complete enough for promotion's adapter to read. */
function mirrorRow(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "evt-1",
    name: "Summoner Skirmish",
    startAt: new Date("2026-08-01T09:00:00Z"),
    timezone: null,
    eventFormat: "Constructed",
    playerCount: 64,
    storeName: "LGS Berlin",
    location: "Berlin",
    eventConfigurationTemplate: null,
    ...overrides,
  };
}

/** The citation linking one source key to the live event. */
function citation(provider: string, externalId: string, priority = 0, contributes = true) {
  return {
    id: `src-${externalId}`,
    metaEventId: LIVE_EVENT_ID,
    provider,
    externalId,
    label: provider,
    priority,
    contributes,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function eventOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_OVERLAY_ID,
    metaEventId: LIVE_EVENT_ID,
    provider: null,
    externalId: null,
    name: null,
    eventDate: null,
    format: null,
    playerCount: null,
    organizer: null,
    notes: null,
    tier: "premier",
    country: null,
    location: null,
    claimedFields: ["tier"],
    status: "pending",
    submittedByUserId: USER_ID,
    submissionNote: null,
    acceptedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function playerOverlay(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_OVERLAY_ID,
    metaEventPlayerId: null,
    metaEventId: LIVE_EVENT_ID,
    eventOverlayId: null,
    provider: null,
    sourcePlayerKey: null,
    playerName: "Renata",
    rank: 2,
    rankIsTier: null,
    wins: null,
    losses: null,
    draws: null,
    matchPoints: null,
    opponentMatchWinPct: null,
    gameWinPct: null,
    opponentGameWinPct: null,
    entryStatus: null,
    legendCardId: null,
    championCardId: null,
    listStatus: null,
    claimedFields: ["playerName", "rank"],
    status: "pending",
    submittedByUserId: USER_ID,
    submissionNote: null,
    acceptedAt: null,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    ...overrides,
  };
}

const LIVE_EVENT = {
  id: LIVE_EVENT_ID,
  name: "Summoner Skirmish",
  tier: "local",
  format: "constructed",
  eventDate: "2026-08-01",
  playerCount: 64,
  organizer: "LGS Berlin",
  notes: null,
  country: "DE",
  location: "Berlin",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOverlays.pendingEventOverlays.mockResolvedValue([]);
  mockOverlays.pendingPlayerOverlays.mockResolvedValue([]);
  mockOverlays.cardsByOverlayIds.mockResolvedValue(new Map());
  mockOverlays.acceptedEventOverlays.mockResolvedValue([]);
  mockOverlays.adminEditOverlay.mockResolvedValue(undefined);
  mockOverlays.adminPlayerEditOverlay.mockResolvedValue(undefined);
  mockOverlays.acceptedPlayerOverlays.mockResolvedValue([]);
  mockMetaSubmissions.byPlayerOverlayId.mockResolvedValue(null);
  mockMeta.eventIdForPlayer.mockResolvedValue(LIVE_EVENT_ID);
  mockMeta.rawStandingsForEvent.mockResolvedValue([{ id: LIVE_PLAYER_ID, uvsgamesPlayerId: 4821 }]);
  mockCatalog.cardNamesByIds.mockResolvedValue(new Map([[CARD_ID, "Yasuo"]]));
  mockMeta.eventById.mockResolvedValue(LIVE_EVENT);
  mockMeta.eventsByIds.mockResolvedValue([LIVE_EVENT]);
  mockMeta.livePlayersByIds.mockResolvedValue([]);
  mockMeta.adminPlayersForEvent.mockResolvedValue([]);
  mockMeta.sourcesForEvent.mockResolvedValue([]);
  mockUvsgames.formatMappings.mockResolvedValue(new Map());
  mockUvsgames.templateTiers.mockResolvedValue(new Map());
  mockUvsgames.settings.mockResolvedValue({ competitivePlayerFloor: 128 });
  mockUvsgamesResults.standings.mockResolvedValue([]);
  mockUvsgames.playerDisplayNames.mockResolvedValue(new Map());
  mockTopdeckResults.standings.mockResolvedValue([]);
  mockPlayerLinks.forEvent.mockResolvedValue([]);
});

describe("GET /meta/overlays", () => {
  it("pairs each claimed field with the live value it would replace", async () => {
    mockOverlays.pendingEventOverlays.mockResolvedValue([eventOverlay()]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as { changes: unknown[] }[];

    expect(overlays[0]?.changes).toEqual([{ field: "tier", from: "local", to: "premier" }]);
  });

  it("reports only the fields the overlay claims, not everything it carries", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ metaEventId: null, metaEventPlayerId: LIVE_PLAYER_ID }),
    ]);
    mockMeta.livePlayersByIds.mockResolvedValue([
      {
        id: LIVE_PLAYER_ID,
        metaEventId: LIVE_EVENT_ID,
        playerName: "Renata",
        rank: 4,
        rankIsTier: false,
        wins: 5,
      },
    ]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as { changes: { field: string; from: string | null }[] }[];

    expect(overlays[0]?.changes).toEqual([
      { field: "playerName", from: "Renata", to: "Renata" },
      { field: "rank", from: "4", to: "2" },
    ]);
  });

  it("names the card a legend claim points at, since an id reviews as nothing", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ legendCardId: CARD_ID, claimedFields: ["legendCardId"] }),
    ]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as { changes: unknown[] }[];

    expect(overlays[0]?.changes).toEqual([{ field: "legendCardId", from: null, to: "Yasuo" }]);
  });

  it("keeps a card id the catalog no longer knows, rather than showing nothing", async () => {
    mockCatalog.cardNamesByIds.mockResolvedValue(new Map());
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ championCardId: CARD_ID, claimedFields: ["championCardId"] }),
    ]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as { changes: { to: string }[] }[];

    expect(overlays[0]?.changes[0]?.to).toBe(CARD_ID);
  });

  it("reads every card a queue page names in one batch", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ legendCardId: CARD_ID, claimedFields: ["legendCardId"] }),
      playerOverlay({
        id: "c0000000-0001-4000-a000-000000000002",
        championCardId: CARD_ID,
        claimedFields: ["championCardId"],
      }),
    ]);

    await app.request("/api/admin/v1/meta/overlays");

    expect(mockCatalog.cardNamesByIds).toHaveBeenCalledTimes(1);
    expect(mockCatalog.cardNamesByIds).toHaveBeenCalledWith([CARD_ID]);
  });

  it("resolves each anchored row's live values in one batched read", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ metaEventId: null, metaEventPlayerId: LIVE_PLAYER_ID }),
      playerOverlay({
        id: "c0000000-0001-4000-a000-000000000002",
        metaEventId: null,
        metaEventPlayerId: "f0000000-0001-4000-a000-000000000002",
      }),
    ]);
    mockMeta.livePlayersByIds.mockResolvedValue([]);

    await app.request("/api/admin/v1/meta/overlays");

    expect(mockMeta.livePlayersByIds).toHaveBeenCalledTimes(1);
    expect(mockMeta.livePlayersByIds).toHaveBeenCalledWith([
      LIVE_PLAYER_ID,
      "f0000000-0001-4000-a000-000000000002",
    ]);
    expect(mockMeta.playerById).not.toHaveBeenCalled();
  });

  it("carries the push provider that wrote an overlay, so people's rows read apart", async () => {
    mockOverlays.pendingEventOverlays.mockResolvedValue([
      eventOverlay({ provider: "somepush", externalId: "evt-9" }),
    ]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as {
      provider: string | null;
      sourceEventExternalId: string | null;
    }[];

    expect(overlays[0]).toMatchObject({ provider: "somepush", sourceEventExternalId: "evt-9" });
  });

  it("splits a pushed standings row's key back into the ids a dismiss needs", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ provider: "somepush", sourcePlayerKey: playerSourceKey("evt-9", "p1") }),
    ]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as {
      sourceEventExternalId: string | null;
      sourcePlayerExternalId: string | null;
    }[];

    expect(overlays[0]).toMatchObject({
      sourceEventExternalId: "evt-9",
      sourcePlayerExternalId: "p1",
    });
  });

  it("leaves both source ids null on a row a person wrote", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([playerOverlay()]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as {
      provider: string | null;
      sourceEventExternalId: string | null;
      sourcePlayerExternalId: string | null;
    }[];

    expect(overlays[0]).toMatchObject({
      provider: null,
      sourceEventExternalId: null,
      sourcePlayerExternalId: null,
    });
  });

  it("leaves `cards` out of the field list, since its lines travel separately", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ claimedFields: ["rank", "cards"] }),
    ]);
    mockOverlays.cardsByOverlayIds.mockResolvedValue(
      new Map([
        [
          PLAYER_OVERLAY_ID,
          [
            { lineNumber: 0, zone: "main", quantity: 2, cardName: "Known", cardId: "card-1" },
            { lineNumber: 1, zone: "main", quantity: 1, cardName: "Mystery", cardId: null },
          ],
        ],
      ]),
    );

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as {
      changes: { field: string }[];
      cards: unknown[];
      unresolvedNames: string[];
    }[];

    expect(overlays[0]?.changes.map((change) => change.field)).toEqual(["rank"]);
    expect(overlays[0]?.cards).toHaveLength(2);
    expect(overlays[0]?.unresolvedNames).toEqual(["Mystery"]);
  });

  it("orders the whole queue oldest first, across both kinds", async () => {
    mockOverlays.pendingEventOverlays.mockResolvedValue([
      eventOverlay({ createdAt: new Date("2026-08-03T00:00:00.000Z") }),
    ]);
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([playerOverlay()]);

    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    const overlays = body.overlays as { kind: string }[];

    expect(overlays.map((row) => row.kind)).toEqual(["player", "event"]);
  });
});

describe("GET /meta/overlays/{id}", () => {
  async function detail(id: string) {
    return await readJson(await app.request(`/api/admin/v1/meta/overlays/${id}`));
  }

  it("carries an event overlay's own source key", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(
      eventOverlay({ provider: "somepush", externalId: "evt-9" }),
    );

    expect(await detail(EVENT_OVERLAY_ID)).toMatchObject({
      kind: "event",
      provider: "somepush",
      sourceEventExternalId: "evt-9",
      sourcePlayerExternalId: null,
      metaEventPlayerId: null,
    });
  });

  it("splits a pushed standings row's key, and names the row it is anchored to", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(undefined);
    mockOverlays.playerOverlayById.mockResolvedValue(
      playerOverlay({
        provider: "somepush",
        sourcePlayerKey: playerSourceKey("evt-9", "p1"),
        metaEventId: null,
        metaEventPlayerId: LIVE_PLAYER_ID,
        cards: [],
      }),
    );
    mockMeta.playerById.mockResolvedValue({ id: LIVE_PLAYER_ID, playerName: "Renata", rank: 4 });

    expect(await detail(PLAYER_OVERLAY_ID)).toMatchObject({
      kind: "player",
      provider: "somepush",
      sourceEventExternalId: "evt-9",
      sourcePlayerExternalId: "p1",
      metaEventPlayerId: LIVE_PLAYER_ID,
    });
  });

  it("leaves the source ids null on a loose overlay a person wrote", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(undefined);
    mockOverlays.playerOverlayById.mockResolvedValue(playerOverlay({ cards: [] }));

    expect(await detail(PLAYER_OVERLAY_ID)).toMatchObject({
      provider: null,
      sourceEventExternalId: null,
      sourcePlayerExternalId: null,
      metaEventPlayerId: null,
    });
  });

  it("404s an id that is neither kind of overlay", async () => {
    mockOverlays.eventOverlayById.mockResolvedValue(undefined);
    mockOverlays.playerOverlayById.mockResolvedValue(undefined);

    const response = await app.request(`/api/admin/v1/meta/overlays/${PLAYER_OVERLAY_ID}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /meta/events/{id}/drift", () => {
  it("greys out a field an accepted overlay has taken from the sources", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([citation("uvsgames", "evt-1")]);
    mockUvsgames.byKey.mockResolvedValue(mirrorRow());
    mockOverlays.acceptedEventOverlays.mockResolvedValue([eventOverlay({ status: "accepted" })]);

    const body = await readJson(
      await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`),
    );
    const fields = body.fields as { field: string; claimedByOverlay: boolean }[];

    expect(fields.find((row) => row.field === "tier")?.claimedByOverlay).toBe(true);
    expect(fields.find((row) => row.field === "name")?.claimedByOverlay).toBe(false);
  });

  it("marks a push provider as having no mirror to promote from", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([citation("somepush", "x-1")]);

    const body = await readJson(
      await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`),
    );
    const sources = body.sources as { hasMirror: boolean }[];

    expect(sources[0]?.hasMirror).toBe(false);
  });

  it("names the source a live value came from, so provenance is visible", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([citation("uvsgames", "evt-1")]);
    mockUvsgames.byKey.mockResolvedValue(mirrorRow());
    mockUvsgames.formatMappings.mockResolvedValue(new Map([["constructed", "constructed"]]));

    const body = await readJson(
      await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`),
    );
    const fields = body.fields as { field: string; wonBy: string | null }[];

    expect(fields.find((row) => row.field === "name")?.wonBy).toBe("uvsgames");
  });

  it("blanks one source's column rather than failing the page on a bad row", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([citation("uvsgames", "evt-1")]);
    mockUvsgames.byKey.mockResolvedValue(mirrorRow({ startAt: undefined }));

    const response = await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(
      (body.fields as { bySource: { value: string | null; raw: string | null }[] }[])[0]?.bySource,
    ).toEqual([{ value: null, raw: null }]);
  });

  it("shows the source's own term under a value the projection rewrote", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([citation("uvsgames", "evt-1")]);
    mockUvsgames.byKey.mockResolvedValue(mirrorRow());
    mockUvsgames.formatMappings.mockResolvedValue(new Map([["constructed", "constructed"]]));

    const body = await readJson(
      await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`),
    );
    const fields = body.fields as { field: string; bySource: { raw: string | null }[] }[];

    expect(fields.find((row) => row.field === "format")?.bySource[0]?.raw).toBe("Constructed");
    expect(fields.find((row) => row.field === "name")?.bySource[0]?.raw).toBeNull();
  });

  it("404s an event that does not exist", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const response = await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/drift`);

    expect(response.status).toBe(404);
  });
});

describe("POST /meta/events/{id}/overlays", () => {
  async function claim(...edits: { field: string; value: string | null }[]): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/overlays`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits }),
    });
  }

  it("writes an accepted overlay claiming exactly the named field", async () => {
    mockOverlays.insertEventOverlay.mockResolvedValue("new-overlay");

    const response = await claim({ field: "organizer", value: "LGS Zaun" });

    expect(response.status).toBe(200);
    expect(mockOverlays.insertEventOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        metaEventId: LIVE_EVENT_ID,
        claimedFields: ["organizer"],
        status: "accepted",
        organizer: "LGS Zaun",
      }),
    );
  });

  it("writes several edits as one overlay row claiming all of them", async () => {
    mockOverlays.insertEventOverlay.mockResolvedValue("new-overlay");

    await claim(
      { field: "organizer", value: "LGS Zaun" },
      { field: "location", value: "Zaun" },
      { field: "playerCount", value: "128" },
    );

    expect(mockOverlays.insertEventOverlay).toHaveBeenCalledTimes(1);
    expect(mockOverlays.insertEventOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        claimedFields: ["organizer", "location", "playerCount"],
        organizer: "LGS Zaun",
        location: "Zaun",
        playerCount: 128,
      }),
    );
  });

  it("merges an admin's later edits into the row their earlier ones made", async () => {
    mockOverlays.adminEditOverlay.mockResolvedValue(
      eventOverlay({ status: "accepted", claimedFields: ["organizer"], organizer: "LGS Berlin" }),
    );

    await claim({ field: "location", value: "Zaun" });

    expect(mockOverlays.insertEventOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(
      EVENT_OVERLAY_ID,
      expect.objectContaining({ claimedFields: ["organizer", "location"], location: "Zaun" }),
    );
  });

  it("clears a field when the value is emptied, which the mask makes expressible", async () => {
    mockOverlays.insertEventOverlay.mockResolvedValue("new-overlay");

    await claim({ field: "organizer", value: "   " });

    expect(mockOverlays.insertEventOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["organizer"], organizer: null }),
    );
  });

  it("claims a field named twice only once, and lets the later value win", async () => {
    mockOverlays.insertEventOverlay.mockResolvedValue("new-overlay");

    await claim(
      { field: "organizer", value: "LGS Zaun" },
      { field: "organizer", value: "LGS Piltover" },
    );

    expect(mockOverlays.insertEventOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["organizer"], organizer: "LGS Piltover" }),
    );
  });

  it("refuses to clear a field the live row cannot be without", async () => {
    const response = await claim({ field: "name", value: "" });

    expect(response.status).toBe(400);
    expect(mockOverlays.insertEventOverlay).not.toHaveBeenCalled();
  });

  it("refuses a player count that is not a positive whole number", async () => {
    const response = await claim({ field: "playerCount", value: "-3" });

    expect(response.status).toBe(400);
  });

  it("refuses a tier outside the vocabulary", async () => {
    const response = await claim({ field: "tier", value: "legendary" });

    expect(response.status).toBe(400);
  });

  it("refuses a date that is not a plain calendar day", async () => {
    const response = await claim({ field: "eventDate", value: "2026-08-01T09:00:00Z" });

    expect(response.status).toBe(400);
    expect(mockOverlays.insertEventOverlay).not.toHaveBeenCalled();
  });

  it("writes nothing when any one edit in the batch is invalid", async () => {
    const response = await claim(
      { field: "organizer", value: "LGS Zaun" },
      { field: "tier", value: "legendary" },
    );

    expect(response.status).toBe(400);
    expect(mockOverlays.insertEventOverlay).not.toHaveBeenCalled();
  });

  it("404s an event that does not exist", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const response = await claim({ field: "organizer", value: "LGS Zaun" });

    expect(response.status).toBe(404);
  });
});

describe("POST /meta/events/{id}/overlays/release", () => {
  async function release(field: string): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/overlays/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ field }),
    });
  }

  it("deletes an admin-edit row once its last claim is handed back", async () => {
    mockOverlays.acceptedEventOverlays.mockResolvedValue([
      eventOverlay({ status: "accepted", claimedFields: ["organizer"], organizer: "LGS Zaun" }),
    ]);

    const response = await release("organizer");

    expect(response.status).toBe(200);
    expect(mockOverlays.deleteEventOverlay).toHaveBeenCalledWith(EVENT_OVERLAY_ID);
    expect(mockOverlays.setEventOverlayStatus).not.toHaveBeenCalled();
  });

  it("rejects a submission whose only claim is handed back, so the ledger reads right", async () => {
    mockOverlays.acceptedEventOverlays.mockResolvedValue([
      eventOverlay({
        status: "accepted",
        claimedFields: ["organizer"],
        organizer: "LGS Zaun",
        submissionNote: "Saw it on stream.",
      }),
    ]);

    await release("organizer");

    expect(mockOverlays.deleteEventOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.setEventOverlayStatus).toHaveBeenCalledWith(
      EVENT_OVERLAY_ID,
      "rejected",
      expect.any(Date),
    );
  });

  it("strips one claim from a row that still holds others", async () => {
    mockOverlays.acceptedEventOverlays.mockResolvedValue([
      eventOverlay({
        status: "accepted",
        claimedFields: ["organizer", "location"],
        organizer: "LGS Zaun",
        location: "Zaun",
      }),
    ]);

    await release("organizer");

    expect(mockOverlays.updateEventOverlay).toHaveBeenCalledWith(EVENT_OVERLAY_ID, {
      claimedFields: ["location"],
      organizer: null,
    });
    expect(mockOverlays.deleteEventOverlay).not.toHaveBeenCalled();
  });

  it("leaves an overlay that never claimed the field alone", async () => {
    mockOverlays.acceptedEventOverlays.mockResolvedValue([
      eventOverlay({ status: "accepted", claimedFields: ["tier"] }),
    ]);

    await release("organizer");

    expect(mockOverlays.updateEventOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.deleteEventOverlay).not.toHaveBeenCalled();
  });

  it("404s an event that does not exist", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const response = await release("organizer");

    expect(response.status).toBe(404);
  });
});

describe("POST /meta/players/{id}/overlays", () => {
  async function write(body: Record<string, unknown>): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/players/${LIVE_PLAYER_ID}/overlays`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const LINE = { cardId: CARD_ID, zone: "main", quantity: 3, preferredPrintingId: PRINTING_ID };

  it("claims exactly the fields the body names, and nothing it left out", async () => {
    const response = await write({ fields: { wins: 3, losses: 1 } });

    expect(response.status).toBe(200);
    expect(mockOverlays.insertPlayerOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        metaEventPlayerId: LIVE_PLAYER_ID,
        metaEventId: null,
        eventOverlayId: null,
        claimedFields: ["wins", "losses"],
        status: "accepted",
        wins: 3,
        losses: 1,
      }),
      [],
    );
  });

  it("claims a field set to null, which is the only way to clear one", async () => {
    await write({ fields: { wins: null } });

    expect(mockOverlays.insertPlayerOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["wins"], wins: null }),
      [],
    );
  });

  it("merges into the row this admin's earlier edits already made", async () => {
    mockOverlays.adminPlayerEditOverlay.mockResolvedValue(
      playerOverlay({ claimedFields: ["rank"], status: "accepted" }),
    );

    await write({ fields: { wins: 3 } });

    expect(mockOverlays.insertPlayerOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.updatePlayerOverlay).toHaveBeenCalledWith(
      PLAYER_OVERLAY_ID,
      expect.objectContaining({ claimedFields: ["rank", "wins"], wins: 3 }),
      undefined,
    );
  });

  it("refuses to clear the name of a row no source names", async () => {
    mockMeta.rawStandingsForEvent.mockResolvedValue([
      { id: LIVE_PLAYER_ID, uvsgamesPlayerId: null },
    ]);

    const response = await write({ fields: { playerName: null } });

    expect(response.status).toBe(400);
    expect(mockOverlays.insertPlayerOverlay).not.toHaveBeenCalled();
  });

  it("hands the name back to the source when the row has one", async () => {
    const response = await write({ fields: { playerName: null } });

    expect(response.status).toBe(200);
    expect(mockOverlays.insertPlayerOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["playerName"], playerName: null }),
      [],
    );
  });

  it("resolves each list line to the catalog's own name for the card", async () => {
    await write({ list: { cards: [LINE], listStatus: "partial" } });

    expect(mockOverlays.insertPlayerOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["cards", "listStatus"], listStatus: "partial" }),
      [
        {
          lineNumber: 0,
          zone: "main",
          quantity: 3,
          cardName: "Yasuo",
          cardId: CARD_ID,
          preferredPrintingId: PRINTING_ID,
        },
      ],
    );
  });

  it("400s a list naming a card the catalog no longer has, writing nothing", async () => {
    mockCatalog.cardNamesByIds.mockResolvedValue(new Map());

    const response = await write({ list: { cards: [LINE], listStatus: "full" } });

    expect(response.status).toBe(400);
    expect(mockOverlays.insertPlayerOverlay).not.toHaveBeenCalled();
  });

  it("claims an empty list, which is how an admin says there is none", async () => {
    await write({ list: null });

    expect(mockOverlays.insertPlayerOverlay).toHaveBeenCalledWith(
      expect.objectContaining({ claimedFields: ["cards", "listStatus"], listStatus: "none" }),
      [],
    );
  });

  it("renames the derived deck after the promote, not before it", async () => {
    const order: string[] = [];
    vi.mocked(promoteMetaEvent).mockImplementationOnce(() => {
      order.push("promote");
      return Promise.resolve({
        metaEventId: LIVE_EVENT_ID,
        players: 0,
        removedPlayers: 0,
        decks: 0,
        matches: 0,
        phases: 0,
        unresolvedNames: [],
        mergedLines: [],
        errors: [],
      });
    });
    mockMeta.renamePlayerDeck.mockImplementationOnce(() => {
      order.push("rename");
      return Promise.resolve(true);
    });

    await write({ list: { name: "Yasuo Control", cards: [LINE], listStatus: "full" } });

    expect(order).toEqual(["promote", "rename"]);
    expect(mockMeta.renamePlayerDeck).toHaveBeenCalledWith(LIVE_PLAYER_ID, "Yasuo Control");
  });

  it("leaves the deck name alone when the list claims none", async () => {
    await write({ list: { cards: [LINE], listStatus: "full" } });

    expect(mockMeta.renamePlayerDeck).not.toHaveBeenCalled();
  });

  it("writes nothing at all for a body that claims no field", async () => {
    const response = await write({ fields: {} });

    expect(response.status).toBe(200);
    expect(mockOverlays.insertPlayerOverlay).not.toHaveBeenCalled();
    expect(vi.mocked(promoteMetaEvent)).not.toHaveBeenCalled();
  });

  it("404s a standings row that does not exist", async () => {
    mockMeta.eventIdForPlayer.mockResolvedValue(undefined);

    const response = await write({ fields: { wins: 3 } });

    expect(response.status).toBe(404);
    expect(mockOverlays.insertPlayerOverlay).not.toHaveBeenCalled();
  });
});

describe("GET /meta/overlays, the facts a grouped queue reads", () => {
  const OTHER_EVENT_ID = "e0000000-0002-4000-a000-000000000002";
  const OTHER_PLAYER_ID = "f0000000-0002-4000-a000-000000000002";

  /** A live standings row as `adminPlayersForEvent` lists it. */
  function standing(overrides: Record<string, unknown> = {}) {
    return {
      id: LIVE_PLAYER_ID,
      rank: 2,
      rankIsTier: false,
      playerName: "Renata",
      deckId: null,
      ...overrides,
    };
  }

  async function queue(): Promise<Record<string, unknown>[]> {
    const body = await readJson(await app.request("/api/admin/v1/meta/overlays"));
    return body.overlays as Record<string, unknown>[];
  }

  beforeEach(() => {
    mockMeta.eventsByIds.mockResolvedValue([{ ...LIVE_EVENT, slug: "summoner-skirmish" }]);
  });

  it("puts the live event's name, slug, date and format on a player row", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([playerOverlay()]);

    const [row] = await queue();

    expect(row).toMatchObject({
      metaEventId: LIVE_EVENT_ID,
      metaEventName: "Summoner Skirmish",
      metaEventSlug: "summoner-skirmish",
      eventDate: "2026-08-01",
      eventFormat: "constructed",
      eventOverlayId: null,
      rank: 2,
      rankIsTier: null,
    });
  });

  it("resolves a linked row's event through its anchor when the column is empty", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({
        metaEventId: null,
        metaEventPlayerId: LIVE_PLAYER_ID,
        playerName: null,
        rank: null,
        claimedFields: [],
      }),
    ]);
    mockMeta.livePlayersByIds.mockResolvedValue([
      {
        id: LIVE_PLAYER_ID,
        metaEventId: LIVE_EVENT_ID,
        playerName: "Renata",
        rank: 4,
        rankIsTier: true,
      },
    ]);

    const [row] = await queue();

    expect(row).toMatchObject({
      metaEventId: LIVE_EVENT_ID,
      metaEventName: "Summoner Skirmish",
      rank: 4,
      rankIsTier: true,
      match: { state: "linked", metaEventPlayerId: LIVE_PLAYER_ID, playerName: "Renata", rank: 4 },
    });
  });

  it("resolves a proposal's own rows through the proposal once it has minted", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ metaEventId: null, eventOverlayId: EVENT_OVERLAY_ID }),
    ]);
    mockOverlays.eventOverlayById.mockResolvedValue(eventOverlay({ metaEventId: LIVE_EVENT_ID }));

    const [row] = await queue();

    expect(row).toMatchObject({
      eventOverlayId: EVENT_OVERLAY_ID,
      metaEventId: LIVE_EVENT_ID,
      metaEventName: "Summoner Skirmish",
    });
  });

  it("leaves a row under an unaccepted proposal unscored", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ metaEventId: null, eventOverlayId: EVENT_OVERLAY_ID }),
    ]);
    mockOverlays.eventOverlayById.mockResolvedValue(eventOverlay({ metaEventId: null }));

    const [row] = await queue();

    expect(row).toMatchObject({
      metaEventId: null,
      metaEventName: null,
      match: { state: "unscored", candidateCount: 0 },
    });
    expect(mockMeta.adminPlayersForEvent).not.toHaveBeenCalled();
  });

  it("reads one exact same-name row as the match Accept can link", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([playerOverlay()]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([
      standing(),
      standing({ id: OTHER_PLAYER_ID, playerName: "Renatta", rank: 9 }),
    ]);

    const [row] = await queue();

    expect(row.match).toEqual({
      state: "exact",
      metaEventPlayerId: LIVE_PLAYER_ID,
      playerName: "Renata",
      rank: 2,
      rankIsTier: false,
      candidateCount: 1,
    });
  });

  it("reports candidates when only similar names exist", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([playerOverlay()]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([standing({ playerName: "Renatta", rank: 9 })]);

    const [row] = await queue();

    expect(row.match).toMatchObject({ state: "candidates", candidateCount: 1 });
  });

  it("offers the row at the same finish when the source renamed everyone", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ id: OTHER_PLAYER_ID, playerName: "Zilean" }),
    ]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([standing()]);

    const [row] = await queue();

    expect(row.match).toMatchObject({ state: "candidates", candidateCount: 1 });
  });

  it("reports none when nothing shares the name or the finish", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ id: OTHER_PLAYER_ID, playerName: "Zilean" }),
    ]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([standing({ rank: 9 })]);

    const [row] = await queue();

    expect(row.match).toMatchObject({ state: "none", candidateCount: 0 });
  });

  it("reads each event's standings once, however many rows land on it", async () => {
    mockOverlays.pendingPlayerOverlays.mockResolvedValue([
      playerOverlay({ id: PLAYER_OVERLAY_ID }),
      playerOverlay({ id: OTHER_PLAYER_ID, playerName: "Zilean" }),
      playerOverlay({ id: "c0000000-0003-4000-a000-000000000003", metaEventId: OTHER_EVENT_ID }),
    ]);

    await queue();

    expect(mockMeta.adminPlayersForEvent).toHaveBeenCalledTimes(2);
    expect(mockMeta.eventsByIds).toHaveBeenCalledTimes(1);
  });

  it("carries a proposal's own date and format, since it has no live event yet", async () => {
    mockOverlays.pendingEventOverlays.mockResolvedValue([
      eventOverlay({
        metaEventId: null,
        name: "Brand New",
        eventDate: "2026-09-01",
        format: "freeform",
      }),
    ]);

    const [row] = await queue();

    expect(row).toMatchObject({
      proposedName: "Brand New",
      eventDate: "2026-09-01",
      eventFormat: "freeform",
      metaEventSlug: null,
      match: null,
      rank: null,
    });
  });
});

describe("POST /meta/overlays/players/{id}/accept", () => {
  beforeEach(() => {
    mockOverlays.playerOverlayById.mockResolvedValue(playerOverlay());
    mockMeta.playerById.mockResolvedValue({ id: LIVE_PLAYER_ID, playerName: "Renata", rank: 2 });
  });

  async function accept(body: Record<string, unknown>): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/overlays/players/${PLAYER_OVERLAY_ID}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("links to the named row before accepting, in one call", async () => {
    const response = await accept({ metaEventPlayerId: LIVE_PLAYER_ID });

    expect(response.status).toBe(200);
    expect(mockOverlays.linkPlayerOverlay).toHaveBeenCalledWith(PLAYER_OVERLAY_ID, LIVE_PLAYER_ID);
    expect(mockOverlays.setPlayerOverlayStatus).toHaveBeenCalledWith(
      PLAYER_OVERLAY_ID,
      "accepted",
      expect.any(Date),
    );
    expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
  });

  it("accepts without a link when no row is named", async () => {
    const response = await accept({});

    expect(response.status).toBe(200);
    expect(mockOverlays.linkPlayerOverlay).not.toHaveBeenCalled();
  });
});

describe("POST /meta/overlays/players/accept", () => {
  const SECOND = "c0000000-0002-4000-a000-000000000002";

  async function acceptAll(items: Record<string, unknown>[]): Promise<Response> {
    return await app.request("/api/admin/v1/meta/overlays/players/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
  }

  beforeEach(() => {
    mockOverlays.playerOverlayById.mockImplementation((id: string) =>
      Promise.resolve(
        id === PLAYER_OVERLAY_ID || id === SECOND ? playerOverlay({ id }) : undefined,
      ),
    );
    mockMeta.playerById.mockResolvedValue({ id: LIVE_PLAYER_ID, playerName: "Renata", rank: 2 });
  });

  it("accepts the batch and promotes the shared event once", async () => {
    const response = await acceptAll([
      { id: PLAYER_OVERLAY_ID, metaEventPlayerId: LIVE_PLAYER_ID },
      { id: SECOND },
    ]);

    expect(await readJson(response)).toEqual({ accepted: 2, metaEventIds: [LIVE_EVENT_ID] });
    expect(mockOverlays.linkPlayerOverlay).toHaveBeenCalledTimes(1);
    expect(mockOverlays.setPlayerOverlayStatus).toHaveBeenCalledTimes(2);
    expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when one id is unknown", async () => {
    const response = await acceptAll([
      { id: PLAYER_OVERLAY_ID },
      { id: "c0000000-0009-4000-a000-000000000009" },
    ]);

    expect(response.status).toBe(404);
    expect(mockOverlays.setPlayerOverlayStatus).not.toHaveBeenCalled();
    expect(promoteMetaEvent).not.toHaveBeenCalled();
  });

  it("refuses an empty batch", async () => {
    const response = await acceptAll([]);

    expect(response.status).toBe(400);
  });
});

describe("POST /meta/players/{id}/overlays/release", () => {
  async function release(field: string): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/players/${LIVE_PLAYER_ID}/overlays/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ field }),
    });
  }

  /** An accepted admin edit anchored to the row under test. */
  function anchored(overrides: Record<string, unknown> = {}) {
    return playerOverlay({
      metaEventId: null,
      metaEventPlayerId: LIVE_PLAYER_ID,
      status: "accepted",
      ...overrides,
    });
  }

  it("releases a scalar by stripping the claim and clearing its column", async () => {
    mockOverlays.acceptedPlayerOverlays.mockResolvedValue([
      anchored({ claimedFields: ["wins", "rank"], wins: 4 }),
    ]);

    const response = await release("wins");

    expect(response.status).toBe(200);
    expect(mockOverlays.updatePlayerOverlay).toHaveBeenCalledWith(
      PLAYER_OVERLAY_ID,
      { claimedFields: ["rank"], wins: null },
      undefined,
    );
  });

  it("releases cards and listStatus together, since neither stands alone", async () => {
    mockOverlays.acceptedPlayerOverlays.mockResolvedValue([
      anchored({ claimedFields: ["cards", "listStatus", "wins"], listStatus: "full" }),
    ]);

    await release("listStatus");

    expect(mockOverlays.updatePlayerOverlay).toHaveBeenCalledWith(
      PLAYER_OVERLAY_ID,
      { claimedFields: ["wins"], listStatus: null },
      [],
    );
  });

  it("deletes an admin row whose last claim was handed back", async () => {
    mockOverlays.acceptedPlayerOverlays.mockResolvedValue([anchored({ claimedFields: ["wins"] })]);

    await release("wins");

    expect(mockOverlays.deletePlayerOverlay).toHaveBeenCalledWith(PLAYER_OVERLAY_ID);
    expect(mockOverlays.setPlayerOverlayStatus).not.toHaveBeenCalled();
  });

  it("rejects an emptied submission rather than deleting somebody's contribution", async () => {
    mockOverlays.acceptedPlayerOverlays.mockResolvedValue([
      anchored({ claimedFields: ["wins"], submissionNote: "Saw it on stream." }),
    ]);

    await release("wins");

    expect(mockOverlays.deletePlayerOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.setPlayerOverlayStatus).toHaveBeenCalledWith(
      PLAYER_OVERLAY_ID,
      "rejected",
      expect.any(Date),
    );
  });

  it("leaves another row's overlay on the same event alone", async () => {
    mockOverlays.acceptedPlayerOverlays.mockResolvedValue([
      anchored({ metaEventPlayerId: "f0000000-0001-4000-a000-000000000002" }),
    ]);

    await release("wins");

    expect(mockOverlays.updatePlayerOverlay).not.toHaveBeenCalled();
    expect(mockOverlays.deletePlayerOverlay).not.toHaveBeenCalled();
  });

  it("404s a standings row that does not exist", async () => {
    mockMeta.eventIdForPlayer.mockResolvedValue(undefined);

    const response = await release("wins");

    expect(response.status).toBe(404);
  });
});

describe("POST /meta/overlays/players/{id}/link", () => {
  async function link(metaEventPlayerId: string): Promise<Response> {
    return await app.request(`/api/admin/v1/meta/overlays/players/${PLAYER_OVERLAY_ID}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metaEventPlayerId }),
    });
  }

  it("anchors the overlay to the standings row the reviewer picked", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(playerOverlay());
    mockMeta.playerById.mockResolvedValue({ id: LIVE_PLAYER_ID, playerName: "Renata" });
    mockMeta.eventIdForPlayer.mockResolvedValue(LIVE_EVENT_ID);

    const response = await link(LIVE_PLAYER_ID);

    expect(response.status).toBe(200);
    expect(mockOverlays.linkPlayerOverlay).toHaveBeenCalledWith(PLAYER_OVERLAY_ID, LIVE_PLAYER_ID);
    expect(await readJson(response)).toEqual({ metaEventId: LIVE_EVENT_ID, created: false });
  });

  it("404s a standings row that does not exist, without anchoring anything", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(playerOverlay());
    mockMeta.playerById.mockResolvedValue(undefined);

    const response = await link(LIVE_PLAYER_ID);

    expect(response.status).toBe(404);
    expect(mockOverlays.linkPlayerOverlay).not.toHaveBeenCalled();
  });

  it("404s an overlay that no longer exists", async () => {
    mockOverlays.playerOverlayById.mockResolvedValue(undefined);

    const response = await link(LIVE_PLAYER_ID);

    expect(response.status).toBe(404);
    expect(mockOverlays.linkPlayerOverlay).not.toHaveBeenCalled();
  });
});

describe("POST /meta/event-sources/{id}/priority", () => {
  it("404s a source that is not there", async () => {
    mockMeta.setEventSourcePriority.mockResolvedValue(false);

    const response = await app.request(
      `/api/admin/v1/meta/event-sources/${EVENT_OVERLAY_ID}/priority`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priority: 3 }),
      },
    );

    expect(response.status).toBe(404);
  });
});

describe("the cross-mirror review", () => {
  /** The live row the topdeck standing below is the same person as. */
  function livePlayer(overrides: Record<string, unknown> = {}) {
    return {
      id: LIVE_PLAYER_ID,
      playerName: "Ashe",
      rank: 1,
      rankIsTier: false,
      deckId: null,
      sourceIdentity: "pashe",
      ...overrides,
    };
  }

  /** An event uvsgames feeds and topdeck only cites. */
  function twoMirrors(): void {
    mockMeta.sourcesForEvent.mockResolvedValue([
      citation("uvsgames", "evt-1"),
      citation("topdeck", "tid-1", 1, false),
    ]);
    mockTopdeck.byKey.mockResolvedValue({
      tid: "tid-1",
      name: "Summoner Skirmish",
      format: "Constructed",
      startAt: new Date("2026-08-01T09:00:00Z"),
      playerCount: 64,
      longitude: 13.4,
      country: "DE",
      address: "Berlin",
    });
    mockTopdeckResults.standings.mockResolvedValue([
      {
        tid: "tid-1",
        playerKey: "ashe",
        playerName: "Ashe",
        rank: 1,
        wins: 5,
        losses: 1,
        draws: 0,
        legendName: null,
        sourceDeckId: null,
      },
    ]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([livePlayer()]);
  }

  describe("GET /meta/events/{id}/cross-source", () => {
    it("ranks the unread mirror's entries against the live field", async () => {
      twoMirrors();

      const body = await readJson(
        await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source`),
      );
      const rows = body.rows as {
        sourceIdentity: string;
        state: string;
        suggestions: { metaEventPlayerId: string; isExact: boolean }[];
      }[];

      expect(rows).toHaveLength(1);
      expect(rows[0]?.sourceIdentity).toBe("tashe");
      expect(rows[0]?.state).toBe("unreviewed");
      expect(rows[0]?.suggestions[0]).toMatchObject({
        metaEventPlayerId: LIVE_PLAYER_ID,
        isExact: true,
      });
    });

    it("reports a decided entry rather than ranking it again", async () => {
      twoMirrors();
      mockPlayerLinks.forEvent.mockResolvedValue([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: null },
      ]);

      const body = await readJson(
        await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source`),
      );

      expect((body.rows as { state: string }[])[0]?.state).toBe("distinct");
    });

    it("lists no entries when every mirror is read", async () => {
      mockMeta.sourcesForEvent.mockResolvedValue([citation("uvsgames", "evt-1")]);

      const body = await readJson(
        await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source`),
      );

      expect(body.rows).toEqual([]);
      expect(body.sources).toHaveLength(1);
    });

    it("404s an event that does not exist", async () => {
      mockMeta.eventById.mockResolvedValue(undefined);

      const response = await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source`);

      expect(response.status).toBe(404);
    });
  });

  describe("POST /meta/events/{id}/cross-source/link", () => {
    beforeEach(() => {
      mockMeta.adminPlayersForEvent.mockResolvedValue([livePlayer()]);
    });

    async function link(links: unknown[]): Promise<Response> {
      return await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ links }),
      });
    }

    it("writes the decision and promotes once", async () => {
      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(200);
      expect(mockPlayerLinks.putMany).toHaveBeenCalledWith([
        {
          metaEventId: LIVE_EVENT_ID,
          provider: "topdeck",
          sourceIdentity: "tashe",
          metaEventPlayerId: LIVE_PLAYER_ID,
        },
      ]);
      expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
    });

    it("takes a whole batch under one write and one promote", async () => {
      await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
        { provider: "topdeck", sourceIdentity: "tjinx", metaEventPlayerId: null },
      ]);

      expect(mockPlayerLinks.putMany).toHaveBeenCalledTimes(1);
      expect(mockPlayerLinks.putMany.mock.calls[0]?.[0]).toHaveLength(2);
      expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
    });

    it("writes nothing when a decision names a row that is gone", async () => {
      mockMeta.adminPlayersForEvent.mockResolvedValue([]);

      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(404);
      expect(mockPlayerLinks.putMany).not.toHaveBeenCalled();
    });

    it("refuses a link while the entry's own promoted row still stands", async () => {
      mockMeta.adminPlayersForEvent.mockResolvedValue([
        livePlayer({ id: "f0000000-0001-4000-a000-000000000009", sourceIdentity: "tashe" }),
        livePlayer(),
      ]);

      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(409);
      expect(mockPlayerLinks.putMany).not.toHaveBeenCalled();
    });

    it("refuses two entries of one mirror reaching for the same live row", async () => {
      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
        { provider: "topdeck", sourceIdentity: "tjinx", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(409);
      expect(mockPlayerLinks.putMany).not.toHaveBeenCalled();
    });

    it("refuses a live row another entry of the same mirror already holds", async () => {
      mockPlayerLinks.forEvent.mockResolvedValue([
        { provider: "topdeck", sourceIdentity: "tjinx", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(409);
      expect(mockPlayerLinks.putMany).not.toHaveBeenCalled();
    });

    it("lets an entry keep the row it already holds, which is what re-deciding does", async () => {
      mockPlayerLinks.forEvent.mockResolvedValue([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      const response = await link([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      expect(response.status).toBe(200);
    });
  });

  describe("POST /meta/events/{id}/cross-source/unlink", () => {
    async function unlink(): Promise<Response> {
      return await app.request(`/api/admin/v1/meta/events/${LIVE_EVENT_ID}/cross-source/unlink`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "topdeck", sourceIdentity: "tashe" }),
      });
    }

    it("takes a decision back while the source is only cited", async () => {
      twoMirrors();
      mockPlayerLinks.remove.mockResolvedValue(true);

      const response = await unlink();

      expect(response.status).toBe(200);
      expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
    });

    it("refuses to unlink under a source promotion is reading", async () => {
      mockMeta.sourcesForEvent.mockResolvedValue([
        citation("uvsgames", "evt-1"),
        citation("topdeck", "tid-1", 1, true),
      ]);

      const response = await unlink();

      expect(response.status).toBe(409);
      expect(mockPlayerLinks.remove).not.toHaveBeenCalled();
    });

    it("404s an entry that was never reviewed", async () => {
      twoMirrors();
      mockPlayerLinks.remove.mockResolvedValue(false);

      const response = await unlink();

      expect(response.status).toBe(404);
    });
  });

  describe("POST /meta/event-sources/{id}/contributes", () => {
    async function setContributes(contributes: boolean): Promise<Response> {
      return await app.request(
        `/api/admin/v1/meta/event-sources/${TOPDECK_SOURCE_ID}/contributes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contributes }),
        },
      );
    }

    it("refuses to read a mirror while one of its entries is undecided", async () => {
      twoMirrors();
      mockMeta.eventSourceById.mockResolvedValue({
        ...citation("topdeck", "tid-1", 1, false),
        id: TOPDECK_SOURCE_ID,
      });

      const response = await setContributes(true);

      expect(response.status).toBe(409);
      expect(mockMeta.setEventSourceContributes).not.toHaveBeenCalled();
    });

    it("reads a mirror whose entries are all settled, and promotes", async () => {
      twoMirrors();
      mockMeta.eventSourceById.mockResolvedValue({
        ...citation("topdeck", "tid-1", 1, false),
        id: TOPDECK_SOURCE_ID,
      });
      mockPlayerLinks.forEvent.mockResolvedValue([
        { provider: "topdeck", sourceIdentity: "tashe", metaEventPlayerId: LIVE_PLAYER_ID },
      ]);

      const response = await setContributes(true);

      expect(response.status).toBe(200);
      expect(mockMeta.setEventSourceContributes).toHaveBeenCalledWith(TOPDECK_SOURCE_ID, true);
      expect(promoteMetaEvent).toHaveBeenCalledTimes(1);
    });

    it("stops reading a mirror without asking about its entries", async () => {
      twoMirrors();
      mockMeta.eventSourceById.mockResolvedValue({
        ...citation("topdeck", "tid-1", 1, true),
        id: TOPDECK_SOURCE_ID,
      });

      const response = await setContributes(false);

      expect(response.status).toBe(200);
      expect(mockMeta.setEventSourceContributes).toHaveBeenCalledWith(TOPDECK_SOURCE_ID, false);
    });

    it("400s a citation with no mirror to read", async () => {
      mockMeta.eventSourceById.mockResolvedValue(citation("usersubmission", "u-1"));

      const response = await setContributes(true);

      expect(response.status).toBe(400);
    });

    it("404s a citation that is not there", async () => {
      mockMeta.eventSourceById.mockResolvedValue(undefined);

      const response = await setContributes(true);

      expect(response.status).toBe(404);
    });
  });
});
