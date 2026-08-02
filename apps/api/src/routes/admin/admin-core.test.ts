import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cronJobs } from "../../cron-jobs.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminCoreRouter } from "./core";

// ---------------------------------------------------------------------------
// Test app — mount the oRPC router directly (without the requireAdmin gate).
// `me` / `cron-status` never error, so no AppError bridging is exercised here.
// `me` resolves access via getAdminAccess, so admins/adminGrants are stubbed.
// getAdminAccess caches positive results per user id for 30s (module-level),
// so each `me` test uses a distinct user id.
// ---------------------------------------------------------------------------

const mockAdminsRepo = { isAdmin: vi.fn() };
const mockAdminGrantsRepo = { sectionsForUser: vi.fn() };

let userId = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: userId } as never);
  c.set("repos", { admins: mockAdminsRepo, adminGrants: mockAdminGrantsRepo } as never);
  await next();
});
registerRouterForTest(app, adminCoreRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/me", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns isAdmin true with no sections for a full admin", async () => {
    userId = "a0000000-0001-4000-a000-000000000001";
    mockAdminsRepo.isAdmin.mockResolvedValue(true);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: true, sections: [] });
    expect(mockAdminGrantsRepo.sectionsForUser).not.toHaveBeenCalled();
  });

  it("returns granted sections for a non-admin grant holder", async () => {
    userId = "a0000000-0001-4000-a000-000000000002";
    mockAdminsRepo.isAdmin.mockResolvedValue(false);
    mockAdminGrantsRepo.sectionsForUser.mockResolvedValue(["custom-tags"]);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: false, sections: ["custom-tags"] });
  });

  it("drops grant slugs that are no longer in the section registry", async () => {
    userId = "a0000000-0001-4000-a000-000000000003";
    mockAdminsRepo.isAdmin.mockResolvedValue(false);
    mockAdminGrantsRepo.sectionsForUser.mockResolvedValue(["removed-section", "custom-tags"]);

    const res = await app.request("/api/admin/v1/me");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ isAdmin: false, sections: ["custom-tags"] });
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
    const json = await readJson(res);
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
    const json = await readJson(res);
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
    const json = await readJson(res);
    expect(json).toEqual({
      tcgplayer: { nextRun: date1.toISOString() },
      cardmarket: { nextRun: date2.toISOString() },
      cardtrader: { nextRun: date3.toISOString() },
      changelog: null,
    });
  });
});
