import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminMetaRouter } from "./meta";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockMeta = {
  listEvents: vi.fn(),
  eventById: vi.fn(),
  eventBySlug: vi.fn(),
  createEvent: vi.fn(),
  adminPlayersForEvent: vi.fn(),
  createPlayer: vi.fn(),
  renamePlayerDeck: vi.fn(),
  deletePlayer: vi.fn(),
  sourcesForEvent: vi.fn(),
  insertEventSource: vi.fn(),
  deleteEventSource: vi.fn(),
};

const mockMetaOverlays = { acceptedPlayerOverlays: vi.fn() };

const mockDeckFormats = { getBySlug: vi.fn() };
const mockCustomTags = { listBySlugs: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const EVENT_ID = "b0000000-0001-4000-a000-000000000001";
const SOURCE_ID = "c0000000-0001-4000-a000-000000000001";
const PLAYER_ID = "a1000000-0001-4000-a000-000000000001";
const DECK_ID = "d0000000-0001-4000-a000-000000000001";
const CARD_ID = "f0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    meta: mockMeta,
    metaOverlays: mockMetaOverlays,
    deckFormats: mockDeckFormats,
    customTags: mockCustomTags,
  } as never);
  await next();
});
registerRouterForTest(app, adminMetaRouter);

/** @returns A stored citation row, provider-keyed only when asked. */
function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_ID,
    metaEventId: EVENT_ID,
    provider: null,
    externalId: null,
    label: "Twitch VOD",
    sourceUrl: "https://example.invalid/vod",
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

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
    notes: null,
    tier: "store",
    country: null,
    location: null,
    playerRowCount: 0,
    deckCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A standings row with no list attached, as the admin table reads it. */
function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: null,
    legendName: null,
    championCardId: null,
    championName: null,
    listStatus: "none",
    deckId: null,
    shareToken: null,
    deckName: null,
    deckFormat: null,
    cardCount: 0,
    ...overrides,
  };
}

/** @returns A list body for a standings row's archived deck. */
function listBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Renata Control",
    format: "constructed",
    cards: [{ cardId: CARD_ID, zone: "main", quantity: 3 }],
    ...overrides,
  };
}

/** @returns The response to a citation POST. */
function createSource(body: unknown) {
  return app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** @returns The response to a standings-row POST. */
function createPlayer(body: unknown) {
  return app.request("/api/admin/v1/meta/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
});

describe("POST /meta/events", () => {
  it("creates an event without any attribution column", async () => {
    mockMeta.eventBySlug.mockResolvedValue(undefined);
    mockMeta.createEvent.mockResolvedValue(eventRow());

    const res = await app.request("/api/admin/v1/meta/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "summoner-skirmish-2026",
        name: "Summoner Skirmish",
        eventDate: "2026-08-01",
        format: "constructed",
        playerCount: 64,
        organizer: "LGS Berlin",
      }),
    });

    expect(res.status).toBe(201);
    // Migration 255 took the source key and the URL off the live row; the
    // create path must not try to write either back.
    expect(mockMeta.createEvent).toHaveBeenCalledWith({
      slug: "summoner-skirmish-2026",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      playerCount: 64,
      organizer: "LGS Berlin",
      notes: null,
      tier: "store",
      country: null,
      location: null,
    });
    const json = await readJson(res);
    expect(json.sourceUrl).toBeUndefined();
  });
});

describe("GET /meta/events/{id}/players", () => {
  it("lists the whole standings table, deckless entries included", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow({ playerRowCount: 2, deckCount: 1 }));
    mockMetaOverlays.acceptedPlayerOverlays.mockResolvedValue([]);
    mockMeta.adminPlayersForEvent.mockResolvedValue([
      playerRow({
        listStatus: "partial",
        deckId: DECK_ID,
        shareToken: "tok-1",
        deckName: "Renata Control",
        deckFormat: "constructed",
        cardCount: 40,
      }),
      playerRow({
        id: "a1000000-0001-4000-a000-000000000002",
        rank: 8,
        rankIsTier: true,
        playerName: "Ekko",
      }),
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/players`);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.players).toHaveLength(2);
    expect(json.players[0]).toMatchObject({
      listStatus: "partial",
      deckId: DECK_ID,
      shareToken: "tok-1",
      cardCount: 40,
    });
    expect(json.players[1]).toMatchObject({
      rank: 8,
      rankIsTier: true,
      listStatus: "none",
      deckId: null,
      deckFormat: null,
      cardCount: 0,
    });
    expect(json.players[0].claimedFields).toEqual([]);
  });

  it("reports which fields accepted overlays own, per row", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow({ playerRowCount: 1, deckCount: 0 }));
    mockMeta.adminPlayersForEvent.mockResolvedValue([playerRow()]);
    mockMetaOverlays.acceptedPlayerOverlays.mockResolvedValue([
      { metaEventPlayerId: PLAYER_ID, claimedFields: ["rank", "wins"] },
      { metaEventPlayerId: PLAYER_ID, claimedFields: ["wins", "cards"] },
      { metaEventPlayerId: null, claimedFields: ["playerName"] },
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/players`);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.players[0].claimedFields.toSorted()).toEqual(["cards", "rank", "wins"]);
  });

  it("keeps one row's claims off another row on the same event", async () => {
    const otherId = "a1000000-0001-4000-a000-0000000000ff";
    mockMeta.eventById.mockResolvedValue(eventRow({ playerRowCount: 2, deckCount: 0 }));
    mockMeta.adminPlayersForEvent.mockResolvedValue([
      playerRow(),
      playerRow({ id: otherId, rank: 2 }),
    ]);
    mockMetaOverlays.acceptedPlayerOverlays.mockResolvedValue([
      { metaEventPlayerId: otherId, claimedFields: ["wins"] },
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/players`);

    const json = await readJson(res);
    expect(json.players[0].claimedFields).toEqual([]);
    expect(json.players[1].claimedFields).toEqual(["wins"]);
  });

  it("404s for an unknown event", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/players`);

    expect(res.status).toBe(404);
    expect(mockMeta.adminPlayersForEvent).not.toHaveBeenCalled();
  });
});

describe("POST /meta/players", () => {
  it("files a standings-only entry, which gets no deck and no permalink", async () => {
    mockMeta.createPlayer.mockResolvedValue({ metaEventPlayerId: PLAYER_ID, deckId: null });

    const res = await createPlayer({
      eventId: EVENT_ID,
      rank: 12,
      playerName: "Ekko",
      legendCardId: CARD_ID,
    });

    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({
      metaEventPlayerId: PLAYER_ID,
      deckId: null,
      shareToken: null,
    });
    expect(mockMeta.createPlayer).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        rank: 12,
        rankIsTier: false,
        playerName: "Ekko",
        wins: null,
        losses: null,
        draws: null,
        legendCardId: CARD_ID,
        championCardId: null,
        deck: null,
      },
      null,
    );
    // No list, so no format was validated.
    expect(mockDeckFormats.getBySlug).not.toHaveBeenCalled();
  });

  it("mints a permalink for an entry that arrives with a list", async () => {
    mockMeta.createPlayer.mockResolvedValue({ metaEventPlayerId: PLAYER_ID, deckId: DECK_ID });

    const res = await createPlayer({
      eventId: EVENT_ID,
      rank: 1,
      rankIsTier: true,
      playerName: "Renata",
      wins: 5,
      losses: 1,
      draws: 0,
      list: listBody({ listStatus: "partial" }),
    });

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.deckId).toBe(DECK_ID);
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
    expect(mockMeta.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        rankIsTier: true,
        deck: {
          name: "Renata Control",
          format: "constructed",
          formatConfig: null,
          cards: [{ cardId: CARD_ID, zone: "main", quantity: 3, preferredPrintingId: null }],
          listStatus: "partial",
        },
      }),
      json.shareToken,
    );
  });

  it("defaults an unlabelled list to a full one", async () => {
    mockMeta.createPlayer.mockResolvedValue({ metaEventPlayerId: PLAYER_ID, deckId: DECK_ID });

    await createPlayer({ eventId: EVENT_ID, rank: 1, playerName: "Renata", list: listBody() });

    expect(mockMeta.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ deck: expect.objectContaining({ listStatus: "full" }) }),
      expect.any(String),
    );
  });

  it("rejects a list in an unknown format", async () => {
    mockDeckFormats.getBySlug.mockResolvedValue(undefined);

    const res = await createPlayer({
      eventId: EVENT_ID,
      rank: 1,
      playerName: "Renata",
      list: listBody({ format: "pauper" }),
    });

    expect(res.status).toBe(400);
    expect(mockMeta.createPlayer).not.toHaveBeenCalled();
  });

  it("404s when the event is gone", async () => {
    mockMeta.createPlayer.mockResolvedValue(undefined);

    const res = await createPlayer({ eventId: EVENT_ID, rank: 1, playerName: "Renata" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /meta/players/{id}", () => {
  it("removes a standings row", async () => {
    mockMeta.deletePlayer.mockResolvedValue(true);

    const res = await app.request(`/api/admin/v1/meta/players/${PLAYER_ID}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(mockMeta.deletePlayer).toHaveBeenCalledWith(PLAYER_ID);
  });

  it("404s an unknown standings row", async () => {
    mockMeta.deletePlayer.mockResolvedValue(false);

    const res = await app.request(`/api/admin/v1/meta/players/${PLAYER_ID}`, { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});

describe("POST /meta/players/{id}/deck-name", () => {
  function rename(name: string) {
    return app.request(`/api/admin/v1/meta/players/${PLAYER_ID}/deck-name`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  it("renames the standings row's deck, trimming what it was sent", async () => {
    mockMeta.renamePlayerDeck.mockResolvedValue(true);

    const res = await rename("  Yasuo Control  ");

    expect(res.status).toBe(204);
    expect(mockMeta.renamePlayerDeck).toHaveBeenCalledWith(PLAYER_ID, "Yasuo Control");
  });

  it("refuses a name that is nothing but whitespace", async () => {
    const res = await rename("   ");

    // The trim runs before the length check, so this fails `min(1)` instead
    // of arriving at the repo as a deck named with blanks.
    expect(res.status).toBe(400);
    expect(mockMeta.renamePlayerDeck).not.toHaveBeenCalled();
  });

  it("404s a standings row with no deck to rename", async () => {
    mockMeta.renamePlayerDeck.mockResolvedValue(false);

    const res = await rename("Yasuo Control");

    expect(res.status).toBe(404);
  });
});

describe("GET /meta/events/{id}/sources", () => {
  it("lists the event's citations", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow());
    mockMeta.sourcesForEvent.mockResolvedValue([
      sourceRow({ provider: "uvsgames", externalId: "evt-1", label: "uvsgames" }),
      sourceRow({ id: "c0000000-0001-4000-a000-000000000002" }),
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources`);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.sources).toHaveLength(2);
    expect(json.sources[0].provider).toBe("uvsgames");
    expect(json.sources[1].provider).toBeNull();
  });

  it("404s for an unknown event", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources`);

    expect(res.status).toBe(404);
    expect(mockMeta.sourcesForEvent).not.toHaveBeenCalled();
  });
});

describe("POST /meta/events/{id}/sources", () => {
  it("writes a hand-entered citation with no source key", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow());
    mockMeta.insertEventSource.mockResolvedValue(sourceRow());

    const res = await createSource({
      label: "Twitch VOD",
      sourceUrl: "https://example.invalid/vod",
    });

    expect(res.status).toBe(201);
    expect(mockMeta.insertEventSource).toHaveBeenCalledWith({
      metaEventId: EVENT_ID,
      provider: null,
      externalId: null,
      label: "Twitch VOD",
      sourceUrl: "https://example.invalid/vod",
    });
  });

  it("accepts a citation with no URL at all", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow());
    mockMeta.insertEventSource.mockResolvedValue(sourceRow({ sourceUrl: null }));

    const res = await createSource({ label: "Standings photo" });

    expect(res.status).toBe(201);
    expect(mockMeta.insertEventSource).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Standings photo", sourceUrl: null }),
    );
  });

  it("rejects a body claiming a provider key", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow());

    const res = await createSource({
      label: "uvsgames",
      provider: "uvsgames",
      externalId: "evt-1",
    });

    // Linking a candidate is what writes a provider citation; one typed in here
    // would collide with that unique key or outlive the link that owns it.
    expect(res.status).toBe(400);
    expect(mockMeta.insertEventSource).not.toHaveBeenCalled();
  });

  it("rejects a blank label", async () => {
    mockMeta.eventById.mockResolvedValue(eventRow());

    const res = await createSource({ label: "   " });

    expect(res.status).toBe(400);
    expect(mockMeta.insertEventSource).not.toHaveBeenCalled();
  });

  it("404s for an unknown event", async () => {
    mockMeta.eventById.mockResolvedValue(undefined);

    const res = await createSource({ label: "Twitch VOD" });

    expect(res.status).toBe(404);
    expect(mockMeta.insertEventSource).not.toHaveBeenCalled();
  });
});

describe("DELETE /meta/events/{id}/sources/{sourceId}", () => {
  it("removes a hand-entered citation", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([sourceRow()]);
    mockMeta.deleteEventSource.mockResolvedValue(true);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources/${SOURCE_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    expect(mockMeta.deleteEventSource).toHaveBeenCalledWith(SOURCE_ID);
  });

  it("refuses a provider citation, which its candidate's link owns", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([
      sourceRow({ provider: "uvsgames", externalId: "evt-1" }),
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources/${SOURCE_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(409);
    expect(mockMeta.deleteEventSource).not.toHaveBeenCalled();
  });

  it("404s a citation that belongs to another event", async () => {
    mockMeta.sourcesForEvent.mockResolvedValue([
      sourceRow({ id: "c0000000-0001-4000-a000-000000000009" }),
    ]);

    const res = await app.request(`/api/admin/v1/meta/events/${EVENT_ID}/sources/${SOURCE_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    expect(mockMeta.deleteEventSource).not.toHaveBeenCalled();
  });
});
