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
  listEvents: vi.fn(),
  eventBySlug: vi.fn(),
  deckSummariesForEvent: vi.fn(),
  sourcesForEvent: vi.fn(),
  contributorsForEvent: vi.fn(),
};

const mockCanonicalPrintings = { resolvePrintingMetaForRows: vi.fn() };

const EVENT_ID = "b0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { meta: mockMeta, canonicalPrintings: mockCanonicalPrintings } as never);
  await next();
});
registerRouterForTest(app, metaRouter);

/** @returns An event row with its deck count, as the repo hands it back. */
function eventRow() {
  return {
    id: EVENT_ID,
    slug: "summoner-skirmish-2026",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: "Top 8 lists only.",
    deckCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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
  mockMeta.deckSummariesForEvent.mockResolvedValue([]);
  mockMeta.sourcesForEvent.mockResolvedValue([]);
  mockMeta.contributorsForEvent.mockResolvedValue([]);
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

  it("404s an unknown slug without reading citations or contributors", async () => {
    mockMeta.eventBySlug.mockResolvedValue(undefined);

    const res = await app.request("/api/v1/meta/events/no-such-event");

    expect(res.status).toBe(404);
    expect(mockMeta.sourcesForEvent).not.toHaveBeenCalled();
    expect(mockMeta.contributorsForEvent).not.toHaveBeenCalled();
  });
});

describe("GET /meta/events", () => {
  it("leaves the long-form fields off the list rows", async () => {
    mockMeta.listEvents.mockResolvedValue([eventRow()]);

    const res = await app.request("/api/v1/meta/events");

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.events[0].slug).toBe("summoner-skirmish-2026");
    expect(json.events[0].notes).toBeUndefined();
    expect(json.events[0].sources).toBeUndefined();
  });
});
