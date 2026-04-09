import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cronJobs } from "../../cron-jobs.js";
import { AppError } from "../../errors.js";
import { adminRoute } from "./index";

// ---------------------------------------------------------------------------
// Mock the requireAdmin middleware to pass through in tests
// ---------------------------------------------------------------------------

vi.mock("../../middleware/require-admin.js", () => ({
  requireAdmin: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
    await next();
  }),
}));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", {} as never);
    c.set("services", {} as never);
    await next();
  })
  .route("/api/v1", adminRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/admin/me", () => {
  it("returns 200 with isAdmin true", async () => {
    const res = await app.request("/api/v1/admin/me");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ isAdmin: true });
  });
});

describe("GET /api/v1/admin/cron-status", () => {
  const originalCronJobs = { ...cronJobs };

  beforeEach(() => {
    cronJobs.tcgplayer = null;
    cronJobs.cardmarket = null;
    cronJobs.cardtrader = null;
    cronJobs.changelog = null;
  });

  afterEach(() => {
    cronJobs.tcgplayer = originalCronJobs.tcgplayer;
    cronJobs.cardmarket = originalCronJobs.cardmarket;
    cronJobs.cardtrader = originalCronJobs.cardtrader;
    cronJobs.changelog = originalCronJobs.changelog;
  });

  it("returns all null when no cron jobs are scheduled", async () => {
    const res = await app.request("/api/v1/admin/cron-status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      tcgplayer: null,
      cardmarket: null,
      cardtrader: null,
      changelog: null,
    });
  });

  it("returns nextRun for scheduled cron jobs", async () => {
    const nextDate = new Date("2026-03-30T12:00:00Z");
    cronJobs.tcgplayer = { nextRun: () => nextDate } as never;
    cronJobs.cardmarket = { nextRun: () => null } as never;

    const res = await app.request("/api/v1/admin/cron-status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      tcgplayer: { nextRun: nextDate.toISOString() },
      cardmarket: { nextRun: null },
      cardtrader: null,
      changelog: null,
    });
  });

  it("returns nextRun for all three when all scheduled", async () => {
    const date1 = new Date("2026-03-30T06:00:00Z");
    const date2 = new Date("2026-03-30T12:00:00Z");
    const date3 = new Date("2026-03-30T18:00:00Z");
    cronJobs.tcgplayer = { nextRun: () => date1 } as never;
    cronJobs.cardmarket = { nextRun: () => date2 } as never;
    cronJobs.cardtrader = { nextRun: () => date3 } as never;

    const res = await app.request("/api/v1/admin/cron-status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      tcgplayer: { nextRun: date1.toISOString() },
      cardmarket: { nextRun: date2.toISOString() },
      cardtrader: { nextRun: date3.toISOString() },
      changelog: null,
    });
  });
});
