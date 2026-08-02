import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminUsersRouter } from "./users";

const mockUsersRepo = {
  listWithCounts: vi.fn(),
};

// Mount the oRPC router directly (without the requireAdmin gate).
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", { users: mockUsersRepo } as never);
  c.set("user", { id: "a0000000-0001-4000-a000-000000000001" } as never);
  await next();
});
registerRouterForTest(app, adminUsersRouter);

describe("GET /api/admin/v1/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns users with aggregate counts and ISO-string dates", async () => {
    mockUsersRepo.listWithCounts.mockResolvedValue([
      {
        id: "V07rIX7hwiXgRxHwxo1HtV1ybv8Z7iyK",
        email: "player@example.com",
        name: "Example Player",
        image: "https://example.com/avatar.jpg",
        isAdmin: true,
        cardCount: 342,
        deckCount: 5,
        collectionCount: 3,
        listCount: 4,
        createdAt: new Date("2026-03-11T18:04:22.059Z"),
        lastActiveAt: new Date("2026-04-22T09:13:51.412Z"),
      },
    ]);

    const res = await app.request("/api/admin/v1/users");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({
      users: [
        {
          id: "V07rIX7hwiXgRxHwxo1HtV1ybv8Z7iyK",
          email: "player@example.com",
          name: "Example Player",
          image: "https://example.com/avatar.jpg",
          isAdmin: true,
          cardCount: 342,
          deckCount: 5,
          collectionCount: 3,
          listCount: 4,
          createdAt: "2026-03-11T18:04:22.059Z",
          lastActiveAt: "2026-04-22T09:13:51.412Z",
        },
      ],
    });
  });

  it("maps a null lastActiveAt to null", async () => {
    mockUsersRepo.listWithCounts.mockResolvedValue([
      {
        id: "u2",
        email: "nobody@example.com",
        name: null,
        image: null,
        isAdmin: false,
        cardCount: 0,
        deckCount: 0,
        collectionCount: 0,
        listCount: 0,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        lastActiveAt: null,
      },
    ]);

    const res = await app.request("/api/admin/v1/users");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.users[0]).toMatchObject({ name: null, image: null, lastActiveAt: null });
  });

  it("returns an empty list when there are no users", async () => {
    mockUsersRepo.listWithCounts.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/users");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ users: [] });
  });
});
