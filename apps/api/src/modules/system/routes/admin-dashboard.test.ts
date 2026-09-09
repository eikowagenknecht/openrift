import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminDashboardRouter } from "./admin-dashboard";

const mockStatus = { getAppStats: vi.fn() };
const mockUsers = { getSignupSeries: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { status: mockStatus, users: mockUsers } as never);
  await next();
});
registerRouterForTest(app, adminDashboardRouter);

const appStats = {
  totalUsers: 100,
  recentSignups7d: 5,
  totalCards: 312,
  totalPrintings: 468,
  totalSets: 4,
  totalCollections: 80,
  totalUserDecks: 25,
  totalMetaDecks: 12,
  totalWishlists: 9,
  totalTradelists: 6,
  totalFriendGroups: 3,
  totalCopies: 142,
};

const signups = [
  { date: "2026-09-01", count: 3 },
  { date: "2026-09-02", count: 0 },
  { date: "2026-09-03", count: 7 },
];

describe("GET /dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockStatus.getAppStats.mockResolvedValue(appStats);
    mockUsers.getSignupSeries.mockResolvedValue(signups);
  });

  it("returns the app totals alongside the signup series", async () => {
    const res = await app.request("/api/admin/v1/dashboard");
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json.app).toEqual(appStats);
    expect(json.signups).toEqual(signups);
  });

  it("returns an empty series when nobody has signed up", async () => {
    mockUsers.getSignupSeries.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/dashboard");
    expect(res.status).toBe(200);

    const json = await readJson(res);
    expect(json.signups).toEqual([]);
  });
});
