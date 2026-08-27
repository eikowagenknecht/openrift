import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicFriendGroupsRouter } from "./friend-groups";

const GROUP_ID = "00000000-0000-4000-a000-000000000001";
const USER_ID = "00000000-0000-4000-a000-000000000002";
const CODE = "ABCDEFGHIJKL";
const now = new Date("2026-04-20T00:00:00Z");

const group = {
  id: GROUP_ID,
  slug: "playgroup",
  name: "Tuesday Crew",
  description: "Weekly Riftbound at the shop",
  code: CODE,
  codeRotatedAt: now,
  createdAt: now,
  updatedAt: now,
};

const ownerMembership = {
  groupId: GROUP_ID,
  userId: USER_ID,
  role: "owner" as const,
  joinedAt: now,
};

const enrichedOwner = {
  ...ownerMembership,
  userName: "Test Owner",
  userEmail: "owner@example.com",
  userImage: null,
};

/**
 * Mounts the public router with `user` pre-set, which short-circuits
 * `resolveSession` so `loadUser()` returns exactly what the test asked for.
 * `null` is the anonymous visitor the route exists to serve.
 *
 * @returns The test app.
 */
function makeApp(overrides: {
  user?: { id: string } | null;
  friendGroups?: Record<string, unknown>;
}) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", (overrides.user ?? null) as never);
    c.set("repos", {
      friendGroups: {
        getByCode: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
        ...overrides.friendGroups,
      },
    } as never);
    await next();
  });
  registerRouterForTest(app, publicFriendGroupsRouter);
  return app;
}

describe("public friend-groups route", () => {
  it("previews the group for a visitor with no account", async () => {
    const app = makeApp({ user: null });
    const res = await app.request(`/api/v1/friend-groups/preview?code=${CODE}`);
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      name: string;
      description: string;
      memberCount: number;
      viewerStatus: string;
    };
    expect(body.name).toBe("Tuesday Crew");
    expect(body.description).toBe("Weekly Riftbound at the shop");
    expect(body.memberCount).toBe(1);
    expect(body.viewerStatus).toBe("available");
  });

  it("never exposes the roster to someone the group hasn't accepted", async () => {
    const app = makeApp({ user: null });
    const res = await app.request(`/api/v1/friend-groups/preview?code=${CODE}`);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("members");
    expect(body).not.toHaveProperty("memberPreviews");
    expect(body).not.toHaveProperty("ownerName");
    expect(JSON.stringify(body)).not.toContain("owner@example.com");
  });

  it("reports an existing membership so the landing can offer the group instead", async () => {
    const app = makeApp({
      user: { id: USER_ID },
      friendGroups: { getMembership: vi.fn(() => Promise.resolve(ownerMembership)) },
    });
    const res = await app.request(`/api/v1/friend-groups/preview?code=${CODE}`);
    const body = (await readJson(res)) as { viewerStatus: string };
    expect(body.viewerStatus).toBe("member");
  });

  it("reports a queued request so the landing doesn't offer to send a second", async () => {
    const app = makeApp({
      user: { id: USER_ID },
      friendGroups: {
        getInvite: vi.fn(() =>
          Promise.resolve({
            id: "req-1",
            groupId: GROUP_ID,
            userId: USER_ID,
            direction: "request",
            createdAt: now,
          }),
        ),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/preview?code=${CODE}`);
    const body = (await readJson(res)) as { viewerStatus: string };
    expect(body.viewerStatus).toBe("pending");
  });

  it("returns 404 for a code that matches nothing", async () => {
    const app = makeApp({
      user: null,
      friendGroups: { getByCode: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.request("/api/v1/friend-groups/preview?code=DOESNOTEXIST");
    expect(res.status).toBe(404);
  });
});
