import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { friendGroupsRoute } from "./friend-groups.js";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const OTHER_ID = "a0000000-0002-4000-a000-000000000001";
const GROUP_ID = "00000000-0000-4000-a000-000000000001";
const LIST_ID = "00000000-0000-4000-a000-000000000010";

const now = new Date("2026-05-19T00:00:00Z");

const group = {
  id: GROUP_ID,
  slug: "playgroup",
  name: "Tuesday Crew",
  description: null,
  code: "ABCDEFGHIJKL",
  codeRotatedAt: now,
  createdAt: now,
  updatedAt: now,
};

const ownerMembership = {
  groupId: GROUP_ID,
  userId: USER_ID,
  role: "owner" as const,
  nickname: null,
  joinedAt: now,
};

const enrichedOwner = {
  ...ownerMembership,
  userName: "Test Owner",
  userEmail: "owner@example.com",
  userImage: null,
};

const memberMembership = { ...ownerMembership, role: "member" as const };

function makeApp(overrides: {
  friendGroups?: Record<string, unknown>;
  friendGroupMatches?: Record<string, unknown>;
  lists?: Record<string, unknown>;
  users?: Record<string, unknown>;
  user?: { id: string };
}) {
  const friendGroups = {
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getByCode: vi.fn(),
    createWithOwner: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    setCode: vi.fn(),
    getMembership: vi.fn(),
    listMembers: vi.fn(() => Promise.resolve([])),
    listGroupsForUser: vi.fn(() => Promise.resolve([])),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    updateRole: vi.fn(),
    updateNickname: vi.fn(),
    transferOwnership: vi.fn(),
    getInvite: vi.fn(),
    listInvitesForUser: vi.fn(() => Promise.resolve([])),
    listRequestsForGroup: vi.fn(() => Promise.resolve([])),
    pendingInvitesCountForUser: vi.fn(() => Promise.resolve(0)),
    createInvite: vi.fn(),
    deleteInvite: vi.fn(),
    listSharesForGroup: vi.fn(() => Promise.resolve([])),
    listShareableForUserInGroup: vi.fn(() => Promise.resolve([])),
    listGroupsSharingList: vi.fn(() => Promise.resolve([])),
    share: vi.fn(),
    unshare: vi.fn(),
    ...overrides.friendGroups,
  };
  const friendGroupMatches = {
    othersHaveYourWants: vi.fn(() => Promise.resolve([])),
    othersWantYourHaves: vi.fn(() => Promise.resolve([])),
    ...overrides.friendGroupMatches,
  };
  const lists = {
    getByIdForUser: vi.fn(),
    ...overrides.lists,
  };
  const users = {
    getByEmail: vi.fn(),
    ...overrides.users,
  };

  const app = new Hono()
    .use("*", async (c, next) => {
      c.set("user", overrides.user ?? { id: USER_ID });
      c.set("repos", { friendGroups, friendGroupMatches, lists, users } as never);
      await next();
    })
    .route("/api/v1", friendGroupsRoute)
    .onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.status as 400);
      }
      throw err;
    });

  return { app, friendGroups, friendGroupMatches, lists, users };
}

describe("friend-groups route", () => {
  // ── List + counts ───────────────────────────────────────────────────────
  it("GET / returns groups and pending invites", async () => {
    const { app } = makeApp({
      friendGroups: {
        listGroupsForUser: vi.fn(() =>
          Promise.resolve([
            { ...group, viewerRole: "owner", memberCount: 2, pendingRequestCount: 1 },
          ]),
        ),
        listInvitesForUser: vi.fn(() =>
          Promise.resolve([
            {
              id: "inv-1",
              groupId: GROUP_ID,
              userId: USER_ID,
              direction: "invite",
              createdAt: now,
              groupName: "Other",
              groupSlug: "other",
            },
          ]),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; pendingInvites: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(body.pendingInvites).toHaveLength(1);
  });

  it("GET /pending-invites-count returns the count", async () => {
    const { app } = makeApp({
      friendGroups: { pendingInvitesCountForUser: vi.fn(() => Promise.resolve(3)) },
    });
    const res = await app.request("/api/v1/friend-groups/pending-invites-count");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 3 });
  });

  // ── Create ──────────────────────────────────────────────────────────────
  it("POST / creates a group", async () => {
    const created = vi.fn(() => Promise.resolve(group));
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(undefined)),
        createWithOwner: created,
      },
    });
    const res = await app.request("/api/v1/friend-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "playgroup", name: "Tuesday Crew", generateCode: true }),
    });
    expect(res.status).toBe(201);
    expect(created).toHaveBeenCalledOnce();
  });

  it("POST / rejects a duplicate slug with 409", async () => {
    const { app } = makeApp({
      friendGroups: { getBySlug: vi.fn(() => Promise.resolve(group)) },
    });
    const res = await app.request("/api/v1/friend-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "playgroup", name: "Tuesday Crew" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST / rejects a reserved slug with 400", async () => {
    const { app } = makeApp({});
    const res = await app.request("/api/v1/friend-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "admin", name: "Reserved" }),
    });
    expect(res.status).toBe(400);
  });

  // ── Preview ─────────────────────────────────────────────────────────────
  it("GET /preview returns viewerStatus=available for non-members", async () => {
    const { app } = makeApp({
      friendGroups: {
        getByCode: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
      },
    });
    const res = await app.request("/api/v1/friend-groups/preview?code=ABCDEFGHIJKL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { viewerStatus: string; ownerName: string };
    expect(body.viewerStatus).toBe("available");
    expect(body.ownerName).toBe("Test Owner");
  });

  it("GET /preview returns 404 on unknown code", async () => {
    const { app } = makeApp({
      friendGroups: { getByCode: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.request("/api/v1/friend-groups/preview?code=DOESNOTEXIST");
    expect(res.status).toBe(404);
  });

  // ── Join ────────────────────────────────────────────────────────────────
  it("POST /join queues a request", async () => {
    const createInvite = vi.fn(() => Promise.resolve());
    const { app } = makeApp({
      friendGroups: {
        getByCode: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
        createInvite,
      },
    });
    const res = await app.request("/api/v1/friend-groups/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDEFGHIJKL" }),
    });
    expect(res.status).toBe(202);
    expect(createInvite).toHaveBeenCalledWith(GROUP_ID, USER_ID, "request");
  });

  it("POST /join rejects existing members with 409", async () => {
    const { app } = makeApp({
      friendGroups: {
        getByCode: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDEFGHIJKL" }),
    });
    expect(res.status).toBe(409);
  });

  // ── Detail ──────────────────────────────────────────────────────────────
  it("GET /{slug} returns the pending stub when the viewer has a request queued", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
        getInvite: vi.fn(() =>
          Promise.resolve({
            id: "inv",
            groupId: GROUP_ID,
            userId: USER_ID,
            direction: "request",
            createdAt: now,
          }),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { viewerStatus: string; members: unknown[] };
    expect(body.viewerStatus).toBe("pending");
    expect(body.members).toEqual([]);
  });

  it("GET /{slug} returns 404 for non-members without a pending request", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(404);
  });

  it("GET /{slug} returns full detail for members and includes pendingRequests for admins", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
        listSharesForGroup: vi.fn(() => Promise.resolve([])),
        listRequestsForGroup: vi.fn(() =>
          Promise.resolve([
            {
              id: "req",
              userId: OTHER_ID,
              groupId: GROUP_ID,
              direction: "request",
              createdAt: now,
              userName: "Pending",
              userEmail: "pending@example.com",
              userImage: null,
            },
          ]),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      viewerRole: string;
      members: unknown[];
      pendingRequests: unknown[];
    };
    expect(body.viewerRole).toBe("owner");
    expect(body.members).toHaveLength(1);
    expect(body.pendingRequests).toHaveLength(1);
  });

  // ── Authz ───────────────────────────────────────────────────────────────
  it("PATCH /{slug} rejects plain members with 403", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /{slug} rejects admins (owner only)", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve({ ...ownerMembership, role: "admin" })),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup", { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("POST /{slug}/leave rejects the owner with 400", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/leave", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("POST /{slug}/transfer-ownership rejects self-transfer", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/transfer-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: USER_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /{slug}/transfer-ownership rejects non-member targets", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(async (_g, uid) => (uid === USER_ID ? ownerMembership : undefined)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/transfer-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: OTHER_ID }),
    });
    expect(res.status).toBe(400);
  });

  // ── Invites ─────────────────────────────────────────────────────────────
  it("POST /{slug}/invites by email rejects unknown emails with 404", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
      users: { getByEmail: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "missing@example.com" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /{slug}/invites/{userId}/accept on invite requires the invitee", async () => {
    // viewer is the owner, target is OTHER_ID, direction is "invite" — owner cannot accept
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getInvite: vi.fn(() =>
          Promise.resolve({
            id: "inv",
            groupId: GROUP_ID,
            userId: OTHER_ID,
            direction: "invite",
            createdAt: now,
          }),
        ),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/invites/${OTHER_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("POST /{slug}/invites/{userId}/accept on request requires admin/owner", async () => {
    // viewer is the requester themselves; they cannot self-approve a request
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getInvite: vi.fn(() =>
          Promise.resolve({
            id: "req",
            groupId: GROUP_ID,
            userId: USER_ID,
            direction: "request",
            createdAt: now,
          }),
        ),
        getMembership: vi.fn(() => Promise.resolve(undefined)),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/invites/${USER_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  // ── Shares ──────────────────────────────────────────────────────────────
  it("POST /{slug}/lists shares a list owned by the viewer", async () => {
    const share = vi.fn(() => Promise.resolve());
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        share,
      },
      lists: { getByIdForUser: vi.fn(() => Promise.resolve({ id: LIST_ID })) },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listId: LIST_ID }),
    });
    expect(res.status).toBe(204);
    expect(share).toHaveBeenCalledWith(GROUP_ID, LIST_ID, USER_ID);
  });

  it("POST /{slug}/lists rejects sharing someone else's list with 404", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
      },
      lists: { getByIdForUser: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/lists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listId: LIST_ID }),
    });
    expect(res.status).toBe(404);
  });

  // ── Match view ──────────────────────────────────────────────────────────
  it("GET /{slug}/matches returns both panels", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
      },
      friendGroupMatches: {
        othersHaveYourWants: vi.fn(() => Promise.resolve([])),
        othersWantYourHaves: vi.fn(() => Promise.resolve([])),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/matches");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      othersHaveYourWants: unknown[];
      othersWantYourHaves: unknown[];
    };
    expect(body.othersHaveYourWants).toEqual([]);
    expect(body.othersWantYourHaves).toEqual([]);
  });
});
