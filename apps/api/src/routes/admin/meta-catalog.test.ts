import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as metaRepromote from "../../services/meta-repromote.js";
import type * as metaRetier from "../../services/meta-retier.js";
import type * as metaSync from "../../services/meta-sync/index.js";
import type * as runJob from "../../services/run-job.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminMetaCatalogRouter } from "./meta-catalog";

const {
  acceptPlayloltcgEvent,
  autoAcceptCatalogBacklog,
  autoAcceptPlayloltcgBacklog,
  backfillCatalog,
  fetchPlayloltcgEvent,
  repromoteMetaEvents,
  retierMetaEvents,
  runJobAsync,
} = vi.hoisted(() => ({
  acceptPlayloltcgEvent: vi.fn(),
  autoAcceptCatalogBacklog: vi.fn(() =>
    Promise.resolve({ considered: 0, accepted: 0, failed: 0, errors: [] }),
  ),
  autoAcceptPlayloltcgBacklog: vi.fn(() =>
    Promise.resolve({ considered: 0, accepted: 0, failed: 0, errors: [] }),
  ),
  fetchPlayloltcgEvent: vi.fn(() => Promise.resolve({})),
  backfillCatalog: vi.fn(() => Promise.resolve({})),
  repromoteMetaEvents: vi.fn(() => Promise.resolve({ events: 0, failed: 0, errors: [] })),
  retierMetaEvents: vi.fn(() =>
    Promise.resolve({ events: 0, failed: 0, errors: [], scanned: 0, moved: 0 }),
  ),
  runJobAsync: vi.fn(
    (
      _deps: unknown,
      _kind: string,
      _trigger: string,
      work: (runId: string) => Promise<unknown>,
    ) => {
      // The real starter fires the work off and answers with the handle; the
      // tests want the crawl's arguments, so it runs inline here.
      void work("run-1");
      return Promise.resolve({ runId: "run-1", status: "running" as const });
    },
  ),
}));

vi.mock("../../services/meta-sync/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof metaSync>()),
  acceptPlayloltcgEvent,
  autoAcceptCatalogBacklog,
  autoAcceptPlayloltcgBacklog,
  backfillCatalog,
  fetchPlayloltcgEvent,
}));

vi.mock("../../services/run-job.js", async (importOriginal) => ({
  ...(await importOriginal<typeof runJob>()),
  runJobAsync,
}));

vi.mock("../../services/meta-repromote.js", async (importOriginal) => ({
  ...(await importOriginal<typeof metaRepromote>()),
  repromoteMetaEvents,
}));

vi.mock("../../services/meta-retier.js", async (importOriginal) => ({
  ...(await importOriginal<typeof metaRetier>()),
  retierMetaEvents,
}));

const mockJobRuns = {
  findRunning: vi.fn(),
  getResult: vi.fn(),
  requestCancel: vi.fn(),
  findLatestForResume: vi.fn(),
  listRecentByKinds: vi.fn(),
};

const mockUvsgamesEvents = {
  formatByName: vi.fn(),
  setFormatMapping: vi.fn(),
  listTemplates: vi.fn(),
  updateTemplate: vi.fn(),
  syncOverview: vi.fn(),
  triageCounts: vi.fn(),
};

const mockPlayloltcgEvents = {
  list: vi.fn(),
  triageCounts: vi.fn(),
  byKey: vi.fn(),
  syncOverview: vi.fn(),
};

const mockMeta = { archiveOverview: vi.fn() };
const mockMetaOverlays = { ignoreEvent: vi.fn(), unignoreEvent: vi.fn() };

const mockDeckFormats = { getBySlug: vi.fn() };
const mockAdminEvents = { insert: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const RUN_ID = "e0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    jobRuns: mockJobRuns,
    uvsgamesEvents: mockUvsgamesEvents,
    playloltcgEvents: mockPlayloltcgEvents,
    meta: mockMeta,
    metaOverlays: mockMetaOverlays,
    deckFormats: mockDeckFormats,
    adminEvents: mockAdminEvents,
  } as never);
  c.set("config", {
    metaSync: { baseUrl: "https://example.invalid", playloltcgBaseUrl: "https://example.invalid" },
  } as never);
  c.set("io", { fetch: vi.fn() } as never);
  await next();
});
registerRouterForTest(app, adminMetaCatalogRouter);

const BASE = "/api/admin/v1/meta/catalogue";

async function post(path: string, body?: unknown): Promise<Response> {
  return await app.request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/** A checkpoint the resume path accepts: it stopped early and said where. */
function checkpoint(overrides: Record<string, unknown> = {}) {
  return {
    complete: false,
    cancelRequested: false,
    rows: 120,
    coveredThrough: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockJobRuns.findLatestForResume.mockResolvedValue(null);
});

describe("POST /catalogue/sync/cancel", () => {
  const uvsBackfill = { source: "uvsgames", job: "backfill" };

  it("404s when no backfill is running", async () => {
    mockJobRuns.findRunning.mockResolvedValue(null);

    const res = await post("/sync/cancel", uvsBackfill);

    expect(res.status).toBe(404);
    expect(mockJobRuns.requestCancel).not.toHaveBeenCalled();
  });

  it("409s while the run has not written its first checkpoint", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });
    mockJobRuns.getResult.mockResolvedValue(null);

    const res = await post("/sync/cancel", uvsBackfill);

    expect(res.status).toBe(409);
    expect(mockJobRuns.requestCancel).not.toHaveBeenCalled();
  });

  it("sets the flag in place, so a heartbeat between the read and the write cannot lose it", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });
    mockJobRuns.getResult.mockResolvedValue(checkpoint());

    const res = await post("/sync/cancel", uvsBackfill);

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ runId: RUN_ID, cancelRequested: true });
    expect(mockJobRuns.requestCancel).toHaveBeenCalledWith(RUN_ID);
    expect(mockJobRuns.findRunning).toHaveBeenCalledWith("meta.uvsgames_backfill");
  });

  it("cancels the playloltcg backfill when that source is named", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });
    mockJobRuns.getResult.mockResolvedValue(checkpoint());

    await post("/sync/cancel", { source: "playloltcg", job: "backfill" });

    expect(mockJobRuns.findRunning).toHaveBeenCalledWith("meta.playloltcg_backfill");
  });

  it("aims a recheck stop at the named source's recheck run", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });

    const res = await post("/sync/cancel", { source: "uvsgames", job: "recheck" });

    expect(res.status).toBe(200);
    expect(mockJobRuns.findRunning).toHaveBeenCalledWith("meta.uvsgames_recheck");
    expect(mockJobRuns.requestCancel).toHaveBeenCalledWith(RUN_ID);
  });

  it("flags a recheck that has written no result yet, since it never writes a checkpoint", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });
    mockJobRuns.getResult.mockResolvedValue(null);

    const res = await post("/sync/cancel", { source: "uvsgames", job: "recheck" });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ runId: RUN_ID, cancelRequested: true });
  });

  it("404s when the recheck is not running, without touching the backfill's run", async () => {
    mockJobRuns.findRunning.mockResolvedValue(null);

    const res = await post("/sync/cancel", { source: "uvsgames", job: "recheck" });

    expect(res.status).toBe(404);
    expect(mockJobRuns.findRunning).toHaveBeenCalledWith("meta.uvsgames_recheck");
    expect(mockJobRuns.requestCancel).not.toHaveBeenCalled();
  });

  it("refuses the playloltcg recheck, which runs without a run id to read the flag from", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_ID });

    const res = await post("/sync/cancel", { source: "playloltcg", job: "recheck" });

    expect(res.status).toBe(400);
    expect(mockJobRuns.findRunning).not.toHaveBeenCalled();
    expect(mockJobRuns.requestCancel).not.toHaveBeenCalled();
  });

  it("rejects a request that names no source or job", async () => {
    const res = await post("/sync/cancel");

    expect(res.status).toBe(400);
    expect(mockJobRuns.findRunning).not.toHaveBeenCalled();
  });
});

describe("POST /catalogue/sync/auto-accept", () => {
  it("sweeps each source's backlog under that source's own job kind", async () => {
    const res = await post("/sync/auto-accept");

    expect(res.status).toBe(202);
    expect(autoAcceptCatalogBacklog).toHaveBeenCalled();
    expect(runJobAsync).toHaveBeenCalledWith(
      expect.anything(),
      "meta.uvsgames_auto_accept",
      "admin",
      expect.any(Function),
      expect.anything(),
    );

    await post("/playloltcg/auto-accept");

    expect(autoAcceptPlayloltcgBacklog).toHaveBeenCalled();
    expect(runJobAsync).toHaveBeenCalledWith(
      expect.anything(),
      "meta.playloltcg_auto_accept",
      "admin",
      expect.any(Function),
      expect.anything(),
    );
  });
});

describe("POST /catalogue/sync/backfill", () => {
  it("resumes one millisecond past the last run's covered instant", async () => {
    mockJobRuns.findLatestForResume.mockResolvedValue({ result: checkpoint() });

    const res = await post("/sync/backfill");

    expect(res.status).toBe(202);
    expect(backfillCatalog).toHaveBeenCalledWith(expect.anything(), "run-1", {
      resumeFrom: new Date("2026-03-01T00:00:00.000Z"),
    });
  });

  it("starts fresh when the last run finished its whole range", async () => {
    mockJobRuns.findLatestForResume.mockResolvedValue({
      result: checkpoint({ complete: true }),
    });

    await post("/sync/backfill");

    expect(backfillCatalog).toHaveBeenCalledWith(expect.anything(), "run-1", {
      resumeFrom: undefined,
    });
  });

  it("starts fresh for a stored result that predates the checkpoint shape", async () => {
    mockJobRuns.findLatestForResume.mockResolvedValue({ result: { pages: 366, rows: 91_500 } });

    await post("/sync/backfill");

    expect(backfillCatalog).toHaveBeenCalledWith(expect.anything(), "run-1", {
      resumeFrom: undefined,
    });
  });

  it("ignores the resume point on a restart, without even reading it", async () => {
    mockJobRuns.findLatestForResume.mockResolvedValue({ result: checkpoint() });

    const res = await post("/sync/backfill/restart");

    expect(res.status).toBe(202);
    expect(mockJobRuns.findLatestForResume).not.toHaveBeenCalled();
    expect(backfillCatalog).toHaveBeenCalledWith(expect.anything(), "run-1");
  });
});

describe("PATCH /catalogue/formats", () => {
  async function patchFormat(body: unknown): Promise<Response> {
    return await app.request(`${BASE}/formats`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("rejects a mapping onto a format the deck rules do not know", async () => {
    mockDeckFormats.getBySlug.mockResolvedValue(undefined);

    const res = await patchFormat({ sourceFormat: "MTC Sealed", mappedFormat: "rift-sealed" });

    expect(res.status).toBe(400);
    expect(mockUvsgamesEvents.setFormatMapping).not.toHaveBeenCalled();
  });

  it("404s a format no catalogue event carries", async () => {
    mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
    mockUvsgamesEvents.formatByName.mockResolvedValue(undefined);

    const res = await patchFormat({ sourceFormat: "MTC Sealed", mappedFormat: "constructed" });

    expect(res.status).toBe(404);
    expect(mockUvsgamesEvents.setFormatMapping).not.toHaveBeenCalled();
  });

  it("answers with the row the write handed back, not the one read before it", async () => {
    mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
    mockUvsgamesEvents.formatByName.mockResolvedValue({
      sourceFormat: "MTC Sealed",
      eventCount: 3,
      mappedFormat: null,
    });
    mockUvsgamesEvents.setFormatMapping.mockResolvedValue({
      sourceFormat: "MTC Sealed",
      eventCount: 4,
      mappedFormat: "constructed",
    });

    const res = await patchFormat({ sourceFormat: "MTC Sealed", mappedFormat: "constructed" });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      sourceFormat: "MTC Sealed",
      eventCount: 4,
      mappedFormat: "constructed",
    });
    expect(mockUvsgamesEvents.setFormatMapping).toHaveBeenCalledWith("MTC Sealed", "constructed");
  });

  it("un-maps a format without asking the deck rules about null", async () => {
    mockUvsgamesEvents.formatByName.mockResolvedValue({
      sourceFormat: "MTC Sealed",
      eventCount: 3,
      mappedFormat: "constructed",
    });
    mockUvsgamesEvents.setFormatMapping.mockResolvedValue({
      sourceFormat: "MTC Sealed",
      eventCount: 3,
      mappedFormat: null,
    });

    const res = await patchFormat({ sourceFormat: "MTC Sealed", mappedFormat: null });

    expect(res.status).toBe(200);
    expect(mockDeckFormats.getBySlug).not.toHaveBeenCalled();
    expect(mockUvsgamesEvents.setFormatMapping).toHaveBeenCalledWith("MTC Sealed", null);
  });
});

describe("catalogue templates", () => {
  const TEMPLATE_ID = "c0000000-0001-4000-a000-000000000001";

  function templateRow(overrides: Record<string, unknown> = {}) {
    return {
      templateId: TEMPLATE_ID,
      sourceName: "Regional Qualifier",
      watched: true,
      tier: null,
      eventCount: 12,
      avgPlayers: 24.5,
      ranEventCount: 10,
      sampleEventName: "Regional Qualifier Berlin",
      lastStartAt: new Date("2026-05-01T10:00:00.000Z"),
      ...overrides,
    };
  }

  async function patchTemplate(body: unknown): Promise<Response> {
    return await app.request(`${BASE}/templates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("lists templates with the tier the name rules would suggest", async () => {
    mockUvsgamesEvents.listTemplates.mockResolvedValue([templateRow()]);

    const res = await app.request(`${BASE}/templates`);

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      templates: [
        {
          templateId: TEMPLATE_ID,
          sourceName: "Regional Qualifier",
          watched: true,
          tier: null,
          suggestedTier: "premier",
          eventCount: 12,
          avgPlayers: 24.5,
          ranEventCount: 10,
          sampleEventName: "Regional Qualifier Berlin",
          lastStartAt: "2026-05-01T10:00:00.000Z",
        },
      ],
    });
  });

  it("404s a template the mirror does not carry", async () => {
    mockUvsgamesEvents.updateTemplate.mockResolvedValue(undefined);

    const res = await patchTemplate({ templateId: TEMPLATE_ID, watched: true });

    expect(res.status).toBe(404);
    expect(repromoteMetaEvents).not.toHaveBeenCalled();
  });

  it("leaves the events alone when only the watch flag moves", async () => {
    mockUvsgamesEvents.updateTemplate.mockResolvedValue(templateRow({ watched: false }));

    const res = await patchTemplate({ templateId: TEMPLATE_ID, watched: false });

    expect(res.status).toBe(200);
    expect(mockUvsgamesEvents.updateTemplate).toHaveBeenCalledWith(TEMPLATE_ID, { watched: false });
    expect(repromoteMetaEvents).not.toHaveBeenCalled();
  });

  it("writes no audit row for a patch that names neither field", async () => {
    mockUvsgamesEvents.updateTemplate.mockResolvedValue(templateRow());

    const res = await patchTemplate({ templateId: TEMPLATE_ID });

    expect(res.status).toBe(200);
    expect(mockAdminEvents.insert).not.toHaveBeenCalled();
    expect(repromoteMetaEvents).not.toHaveBeenCalled();
  });

  it("stores a tier edit without promoting anything", async () => {
    mockUvsgamesEvents.updateTemplate.mockResolvedValue(templateRow({ tier: null }));

    const res = await patchTemplate({ templateId: TEMPLATE_ID, tier: null });

    expect(res.status).toBe(200);
    expect(mockUvsgamesEvents.updateTemplate).toHaveBeenCalledWith(TEMPLATE_ID, { tier: null });
    expect(repromoteMetaEvents).not.toHaveBeenCalled();
    expect(retierMetaEvents).not.toHaveBeenCalled();
  });
});

describe("the archive's own passes", () => {
  it("starts the tier pass as a job and answers with the run handle", async () => {
    const res = await app.request("/api/admin/v1/meta/archive/retier", { method: "POST" });

    expect(res.status).toBe(202);
    expect(await readJson(res)).toMatchObject({ status: "running", runId: "run-1" });
    expect(runJobAsync).toHaveBeenCalledWith(
      expect.anything(),
      "meta.retier",
      "admin",
      expect.any(Function),
      expect.anything(),
    );
    expect(retierMetaEvents).toHaveBeenCalled();
  });

  it("starts the whole-archive repair as its own job", async () => {
    const res = await app.request("/api/admin/v1/meta/archive/repromote", { method: "POST" });

    expect(res.status).toBe(202);
    expect(runJobAsync).toHaveBeenCalledWith(
      expect.anything(),
      "meta.repromote",
      "admin",
      expect.any(Function),
      expect.anything(),
    );
    expect(repromoteMetaEvents).toHaveBeenCalled();
  });

  it("lists the archive passes' runs, which belong to neither source's panel", async () => {
    mockJobRuns.listRecentByKinds.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/meta/archive/jobs");

    expect(res.status).toBe(200);
    expect(mockJobRuns.listRecentByKinds).toHaveBeenCalledWith(
      ["meta.retier", "meta.repromote"],
      expect.any(Number),
    );
  });
});

describe("GET /catalogue/sync", () => {
  const OVERVIEW = {
    total: 4,
    completed: 3,
    decklistPublished: 2,
    missing: 1,
    queued: 1,
    dueRecheck: 0,
    acceptedAwaitingResults: 1,
    acceptedMissing: 0,
    lastSeenAt: new Date("2026-08-20T00:00:00Z"),
  };
  const COUNTS = { new: 1, accepted: 2, dismissed: 3 };
  const ARCHIVE = { events: 2, eventsWithStandings: 1, eventsWithDecklists: 1, decks: 5 };

  beforeEach(() => {
    mockJobRuns.listRecentByKinds.mockResolvedValue([]);
    mockMeta.archiveOverview.mockResolvedValue(ARCHIVE);
    mockUvsgamesEvents.syncOverview.mockResolvedValue(OVERVIEW);
    mockUvsgamesEvents.triageCounts.mockResolvedValue(COUNTS);
    mockPlayloltcgEvents.syncOverview.mockResolvedValue(OVERVIEW);
    mockPlayloltcgEvents.triageCounts.mockResolvedValue(COUNTS);
  });

  it("reads the uvsgames mirror and its own archive slice", async () => {
    const res = await app.request(`${BASE}/sync?source=uvsgames`);

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.catalog.lastSeenAt).toBe("2026-08-20T00:00:00.000Z");
    expect(body.archive).toEqual(ARCHIVE);
    expect(mockUvsgamesEvents.syncOverview).toHaveBeenCalled();
    expect(mockPlayloltcgEvents.syncOverview).not.toHaveBeenCalled();
    expect(mockMeta.archiveOverview).toHaveBeenCalledWith("uvsgames");
  });

  it("switches both the mirror and the archive slice to the named source", async () => {
    const res = await app.request(`${BASE}/sync?source=playloltcg`);

    expect(res.status).toBe(200);
    expect(mockPlayloltcgEvents.syncOverview).toHaveBeenCalled();
    expect(mockUvsgamesEvents.syncOverview).not.toHaveBeenCalled();
    expect(mockMeta.archiveOverview).toHaveBeenCalledWith("playloltcg");
  });

  it("lists only the selected source's runs, so the other's syncs cannot bury them", async () => {
    await app.request(`${BASE}/sync?source=playloltcg`);

    expect(mockJobRuns.listRecentByKinds).toHaveBeenCalledWith(
      [
        "meta.playloltcg_sync",
        "meta.playloltcg_backfill",
        "meta.playloltcg_recheck",
        "meta.playloltcg_event_fetch",
        "meta.playloltcg_auto_accept",
      ],
      expect.any(Number),
    );
  });

  it("keeps the uvsgames event fetch in that source's own run list", async () => {
    await app.request(`${BASE}/sync?source=uvsgames`);

    expect(mockJobRuns.listRecentByKinds).toHaveBeenCalledWith(
      [
        "meta.uvsgames_sync",
        "meta.uvsgames_backfill",
        "meta.uvsgames_recheck",
        "meta.uvsgames_id_sweep",
        "meta.uvsgames_event_fetch",
        "meta.uvsgames_auto_accept",
      ],
      expect.any(Number),
    );
  });

  it("rejects a status request that names no source", async () => {
    const res = await app.request(`${BASE}/sync`);

    expect(res.status).toBe(400);
  });
});

describe("playloltcg catalogue", () => {
  const SHOP_ID = 55_120;

  function playloltcgRow(overrides: Record<string, unknown> = {}) {
    return {
      activityShopId: SHOP_ID,
      name: "Nexus Night Shanghai",
      shopDisplayName: "Rift Cafe",
      city: "Shanghai",
      status: 5,
      battleMode: "constructed",
      playerCount: 24,
      startAt: "2026-08-15",
      triage: "new",
      metaEventId: null,
      metaEventSlug: null,
      fetchedAt: null,
      missingSince: null,
      nextCheckAt: null,
      stagedPlayerCount: 0,
      stagedLegendCount: 0,
      stagedDeckCount: 0,
      ...overrides,
    };
  }

  it("pages the mirror and presents each row with its source URL", async () => {
    mockPlayloltcgEvents.list.mockResolvedValue({ rows: [playloltcgRow()], total: 1 });
    mockPlayloltcgEvents.triageCounts.mockResolvedValue({ new: 1, accepted: 0, dismissed: 0 });

    const res = await app.request(`${BASE}/playloltcg/events?page=2&limit=10&triage=new`);

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toMatchObject({ total: 1, page: 2, limit: 10 });
    expect(body.rows[0]).toMatchObject({
      activityShopId: SHOP_ID,
      shopName: "Rift Cafe",
      city: "Shanghai",
    });
    expect(body.rows[0].sourceUrl).toContain(String(SHOP_ID));
    expect(mockPlayloltcgEvents.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined, triage: "new" }),
      { limit: 10, offset: 10 },
      { sort: undefined, direction: undefined },
    );
  });

  it("accepts a mirrored event and files the audit row under the playloltcg key", async () => {
    mockPlayloltcgEvents.byKey.mockResolvedValue(playloltcgRow());
    acceptPlayloltcgEvent.mockResolvedValue({
      metaEventId: "live-1",
      slug: "nexus-night-shanghai",
      created: true,
    });

    const res = await app.request(`${BASE}/playloltcg/events/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      metaEventId: "live-1",
      slug: "nexus-night-shanghai",
      created: true,
    });
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: `playloltcg:${SHOP_ID}` }),
    );
  });

  it("404s an accept for a key the mirror does not carry", async () => {
    mockPlayloltcgEvents.byKey.mockResolvedValue(undefined);

    const res = await app.request(`${BASE}/playloltcg/events/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(404);
    expect(acceptPlayloltcgEvent).not.toHaveBeenCalled();
  });

  it("writes the ignore key under the playloltcg provider on a dismiss", async () => {
    mockPlayloltcgEvents.byKey.mockResolvedValue(playloltcgRow());

    const res = await app.request(`${BASE}/playloltcg/events/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockMetaOverlays.ignoreEvent).toHaveBeenCalledWith("playloltcg", String(SHOP_ID));
  });

  it("404s a dismiss for a key the mirror does not carry", async () => {
    mockPlayloltcgEvents.byKey.mockResolvedValue(undefined);

    const res = await app.request(`${BASE}/playloltcg/events/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(404);
    expect(mockMetaOverlays.ignoreEvent).not.toHaveBeenCalled();
  });

  it("carries every filter and the order down to the mirror query", async () => {
    mockPlayloltcgEvents.list.mockResolvedValue({ rows: [], total: 0 });
    mockPlayloltcgEvents.triageCounts.mockResolvedValue({ new: 0, accepted: 0, dismissed: 0 });

    const query = [
      "search=nexus",
      "status=5",
      "minPlayers=16",
      "dateFrom=2026-08-01",
      "dateTo=2026-08-31",
      "missing=true",
      "awaitingResults=true",
      "sort=playerCount",
      "direction=asc",
    ].join("&");
    const res = await app.request(`${BASE}/playloltcg/events?${query}`);

    expect(res.status).toBe(200);
    expect(mockPlayloltcgEvents.list).toHaveBeenCalledWith(
      {
        search: "nexus",
        triage: undefined,
        status: 5,
        minPlayers: 16,
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        missing: true,
        awaitingResults: true,
      },
      expect.anything(),
      { sort: "playerCount", direction: "asc" },
    );
  });

  it("rejects a lifecycle step the source does not publish", async () => {
    const res = await app.request(`${BASE}/playloltcg/events?status=9`);

    expect(res.status).toBe(400);
  });

  it("removes the ignore key on an undismiss", async () => {
    mockMetaOverlays.unignoreEvent.mockResolvedValue(true);

    const res = await app.request(`${BASE}/playloltcg/events/undismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(200);
    expect(mockMetaOverlays.unignoreEvent).toHaveBeenCalledWith("playloltcg", String(SHOP_ID));
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "meta-catalog.undismiss" }),
    );
  });

  it("404s an undismiss for a key that was never dismissed", async () => {
    mockMetaOverlays.unignoreEvent.mockResolvedValue(false);

    const res = await app.request(`${BASE}/playloltcg/events/undismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(404);
  });

  it("pulls an accepted event's results out of the ladder's turn", async () => {
    const row = playloltcgRow({ triage: "accepted", metaEventId: "live-1" });
    mockPlayloltcgEvents.byKey.mockResolvedValue(row);

    const res = await app.request(`${BASE}/playloltcg/events/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(202);
    expect(fetchPlayloltcgEvent).toHaveBeenCalledWith(expect.anything(), row);
  });

  it("refuses to fetch an event nobody has accepted yet", async () => {
    mockPlayloltcgEvents.byKey.mockResolvedValue(playloltcgRow());

    const res = await app.request(`${BASE}/playloltcg/events/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityShopId: SHOP_ID }),
    });

    expect(res.status).toBe(400);
    expect(fetchPlayloltcgEvent).not.toHaveBeenCalled();
  });
});
