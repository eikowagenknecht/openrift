import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";

// The handler reads `Bun.version`, but vitest runs under Node where the `Bun`
// global is undefined (or lacks `.version`). Ensure it resolves to a string so
// the output schema's required `server.bunVersion` is satisfied.
const globalWithBun = globalThis as { Bun?: { version?: string } };
if (globalWithBun.Bun?.version === undefined) {
  globalWithBun.Bun = { ...globalWithBun.Bun, version: "1.2.0-test" };
}

// The router imports the cron-jobs singleton at module load; mock every job to
// null so toCronStatus reports them disabled and never calls nextRun().
vi.mock("../../cron-jobs.js", () => ({
  cronJobs: {
    tcgplayer: null,
    cardmarket: null,
    cardtrader: null,
    printingEvents: null,
    changelog: null,
    jobRunsCleanup: null,
  },
}));

// eslint-disable-next-line import/first -- imported after vi.mock so the mock applies.
import { adminStatusRouter } from "./status";

const mockStatus = {
  getDatabaseStatus: vi.fn(),
  getAppStats: vi.fn(),
  getPricingStats: vi.fn(),
};

const mockJobRuns = {
  getLatestPerKind: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx/5xx responses carry
// `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { status: mockStatus, jobRuns: mockJobRuns } as never);
  c.set("config", { isDev: false } as never);
  await next();
});
registerRouterForTest(app, adminStatusRouter);

const dbStatus = {
  status: "ok",
  sizeMb: 12.5,
  activeConnections: 3,
  latestMigration: "0042_add_thing",
  totalMigrations: 42,
};

const appStats = {
  totalUsers: 100,
  recentSignups7d: 5,
  totalCards: 312,
  totalPrintings: 468,
  totalSets: 4,
  totalCollections: 80,
  totalDecks: 25,
  totalCopies: 142,
};

const pricingStats = {
  totalPrices: 9000,
  sources: [{ marketplace: "tcgplayer", products: 400, prices: 4000, latestPrice: "2026-04-01" }],
};

describe("GET /status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockStatus.getDatabaseStatus.mockResolvedValue(dbStatus);
    mockStatus.getAppStats.mockResolvedValue(appStats);
    mockStatus.getPricingStats.mockResolvedValue(pricingStats);
    mockJobRuns.getLatestPerKind.mockResolvedValue({});
  });

  it("returns 200 with server, database, app, and pricing sections", async () => {
    const res = await app.request("/api/admin/v1/status");
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.server.environment).toBe("production");
    expect(typeof json.server.bunVersion).toBe("string");
    expect(json.server.bunVersion.length).toBeGreaterThan(0);
    expect(typeof json.server.uptimeSeconds).toBe("number");
    expect(typeof json.server.memoryMb.rss).toBe("number");

    expect(json.database).toEqual(dbStatus);
    expect(json.app).toEqual(appStats);
    expect(json.pricing).toEqual(pricingStats);

    // Every cron job is null → disabled, with no last run.
    expect(json.cron.jobs.tcgplayer).toEqual({
      enabled: false,
      nextRun: null,
      lastRun: null,
    });
  });

  it("reports environment=development when config.isDev is true", async () => {
    const devApp = new Hono<{ Variables: Variables }>();
    devApp.use("*", async (c, next) => {
      c.set("user", { id: USER_ID } as never);
      c.set("repos", { status: mockStatus, jobRuns: mockJobRuns } as never);
      c.set("config", { isDev: true } as never);
      await next();
    });
    registerRouterForTest(devApp, adminStatusRouter);

    const res = await devApp.request("/api/admin/v1/status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.server.environment).toBe("development");
  });

  it("maps a latest run into the cron job's lastRun", async () => {
    mockJobRuns.getLatestPerKind.mockResolvedValue({
      "tcgplayer.refresh": {
        startedAt: new Date("2026-04-01T10:00:00.000Z"),
        finishedAt: new Date("2026-04-01T10:01:00.000Z"),
        durationMs: 60_000,
        status: "succeeded",
        errorMessage: null,
      },
    });

    const res = await app.request("/api/admin/v1/status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cron.jobs.tcgplayer.lastRun).toEqual({
      startedAt: "2026-04-01T10:00:00.000Z",
      finishedAt: "2026-04-01T10:01:00.000Z",
      durationMs: 60_000,
      status: "succeeded",
      errorMessage: null,
    });
  });
});
