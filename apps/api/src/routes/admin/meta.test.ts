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
  sourcesForEvent: vi.fn(),
  insertEventSource: vi.fn(),
  deleteEventSource: vi.fn(),
};

const mockDeckFormats = { getBySlug: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const EVENT_ID = "b0000000-0001-4000-a000-000000000001";
const SOURCE_ID = "c0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { meta: mockMeta, deckFormats: mockDeckFormats } as never);
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

/** @returns An event row with a deck count, as the repo hands it back. */
function eventRow() {
  return {
    id: EVENT_ID,
    slug: "summoner-skirmish-2026",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: null,
    deckCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /meta/events", () => {
  it("creates an event without any attribution column", async () => {
    mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
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
    });
    const json = await readJson(res);
    expect(json.sourceUrl).toBeUndefined();
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
