import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../../errors.js";
import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { friendGroupsShopsRouter } from "./authenticated-friend-groups-shops.js";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const GROUP_ID = "00000000-0000-4000-a000-000000000001";

const now = new Date("2026-09-09T00:00:00Z");

const group = {
  id: GROUP_ID,
  slug: "playgroup",
  name: "Hexgate Playgroup",
  description: null,
  code: null,
  codeRotatedAt: now,
  createdAt: now,
  updatedAt: now,
};

const membership = {
  groupId: GROUP_ID,
  userId: USER_ID,
  role: "owner" as const,
  joinedAt: now,
};

function makeApp(overrides: {
  friendGroupShops?: Record<string, unknown>;
  role?: "owner" | "admin" | "member";
}) {
  const friendGroups = {
    getBySlugOrPrevious: vi.fn(() => Promise.resolve(group)),
    getMembership: vi.fn(() => Promise.resolve({ ...membership, role: overrides.role ?? "owner" })),
  };
  const friendGroupShops = {
    listShops: vi.fn(() => Promise.resolve([])),
    countShops: vi.fn(() => Promise.resolve(0)),
    searchShops: vi.fn(() => Promise.resolve([])),
    linkShop: vi.fn(() => Promise.resolve()),
    unlinkShop: vi.fn(() => Promise.resolve(true)),
    storeExists: vi.fn(() => Promise.resolve(true)),
    listUpcomingEvents: vi.fn(() => Promise.resolve([])),
    ...overrides.friendGroupShops,
  };

  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID } as never);
    c.set("repos", { friendGroups, friendGroupShops } as never);
    await next();
  });
  registerRouterForTest(app as never, friendGroupsShopsRouter);
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

  return { app, friendGroupShops };
}

describe("friend-group shops route", () => {
  it("GET /shops reports the linked shops and the cap", async () => {
    const { app } = makeApp({
      friendGroupShops: {
        listShops: vi.fn(() =>
          Promise.resolve([
            {
              storeId: 42,
              name: "FUNtainment Berlin",
              location: "79-83 Frankfurter Allee, Berlin, 10247, DE",
              upcomingCount: 8,
              nextEventAt: new Date("2026-09-11T15:00:00Z"),
            },
          ]),
        ),
      },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      items: [
        {
          storeId: 42,
          name: "FUNtainment Berlin",
          location: "79-83 Frankfurter Allee, Berlin, 10247, DE",
          upcomingCount: 8,
          nextEventAt: "2026-09-11T15:00:00.000Z",
        },
      ],
      limit: 10,
    });
  });

  it("GET /shop-events links every row back to the source listing", async () => {
    const { app } = makeApp({
      friendGroupShops: {
        listUpcomingEvents: vi.fn(() =>
          Promise.resolve([
            {
              externalId: "9911",
              name: "Nexus Night",
              startAt: new Date("2026-09-11T15:00:00Z"),
              storeId: 42,
              storeName: "FUNtainment Berlin",
              eventFormat: "Constructed",
            },
          ]),
        ),
        listShops: vi.fn(() =>
          Promise.resolve([
            {
              storeId: 42,
              name: "FUNtainment Berlin",
              location: null,
              upcomingCount: 1,
              nextEventAt: new Date("2026-09-11T15:00:00Z"),
            },
          ]),
        ),
      },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shop-events");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      items: { url: string; startAt: string }[];
      shops: { storeId: number }[];
      horizonDays: number;
    };
    expect(body.items[0]?.url).toBe("https://locator.riftbound.uvsgames.com/events/9911");
    expect(body.items[0]?.startAt).toBe("2026-09-11T15:00:00.000Z");
    expect(body.shops).toEqual([{ storeId: 42, name: "FUNtainment Berlin" }]);
    expect(body.horizonDays).toBe(14);
  });

  it("GET /shop-search marks the shops already linked", async () => {
    const { app } = makeApp({
      friendGroupShops: {
        searchShops: vi.fn(() =>
          Promise.resolve([
            { storeId: 42, name: "FUNtainment Berlin", location: null, upcomingCount: 8 },
            { storeId: 43, name: "Dice Heart", location: null, upcomingCount: 3 },
          ]),
        ),
        listShops: vi.fn(() =>
          Promise.resolve([
            {
              storeId: 43,
              name: "Dice Heart",
              location: null,
              upcomingCount: 3,
              nextEventAt: null,
            },
          ]),
        ),
      },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shop-search?q=berlin");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { items: { storeId: number; linked: boolean }[] };
    expect(body.items).toEqual([
      expect.objectContaining({ storeId: 42, linked: false }),
      expect.objectContaining({ storeId: 43, linked: true }),
    ]);
  });

  it("POST /shops refuses an unknown shop", async () => {
    const { app, friendGroupShops } = makeApp({
      friendGroupShops: { storeExists: vi.fn(() => Promise.resolve(false)) },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId: 999 }),
    });
    expect(res.status).toBe(404);
    expect(friendGroupShops.linkShop).not.toHaveBeenCalled();
  });

  it("POST /shops refuses one shop past the cap", async () => {
    const { app, friendGroupShops } = makeApp({
      friendGroupShops: { countShops: vi.fn(() => Promise.resolve(10)) },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId: 42 }),
    });
    expect(res.status).toBe(409);
    expect(friendGroupShops.linkShop).not.toHaveBeenCalled();
  });

  it("POST /shops links the shop for an admin", async () => {
    const { app, friendGroupShops } = makeApp({ role: "admin" });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId: 42 }),
    });
    expect(res.status).toBe(204);
    expect(friendGroupShops.linkShop).toHaveBeenCalledWith({
      groupId: GROUP_ID,
      storeId: 42,
      addedByUserId: USER_ID,
    });
  });

  it("POST /shops is closed to plain members", async () => {
    const { app, friendGroupShops } = makeApp({ role: "member" });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId: 42 }),
    });
    expect(res.status).toBe(403);
    expect(friendGroupShops.linkShop).not.toHaveBeenCalled();
  });

  it("GET /shop-events stays open to plain members", async () => {
    const { app } = makeApp({ role: "member" });

    const res = await app.request("/api/v1/friend-groups/playgroup/shop-events");
    expect(res.status).toBe(200);
  });

  it("DELETE /shops/{storeId} reports an unlinked shop as missing", async () => {
    const { app } = makeApp({
      friendGroupShops: { unlinkShop: vi.fn(() => Promise.resolve(false)) },
    });

    const res = await app.request("/api/v1/friend-groups/playgroup/shops/42", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("DELETE /shops/{storeId} removes the link", async () => {
    const { app, friendGroupShops } = makeApp({});

    const res = await app.request("/api/v1/friend-groups/playgroup/shops/42", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(friendGroupShops.unlinkShop).toHaveBeenCalledWith(GROUP_ID, 42);
  });
});
