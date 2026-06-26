import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cronJobs } from "../../cron-jobs.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminCoreRouter } from "./core";

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// `me` / `cron-status` never error, so no AppError bridging is exercised here.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  await next();
});
registerRouterForTest(app, adminCoreRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/me", () => {
  it("returns 200 with isAdmin true", async () => {
    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ isAdmin: true });
  });
});

describe("GET /api/admin/v1/cron-status", () => {
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
    const res = await app.request("/api/admin/v1/cron-status");
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

    const res = await app.request("/api/admin/v1/cron-status");
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

    const res = await app.request("/api/admin/v1/cron-status");
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
