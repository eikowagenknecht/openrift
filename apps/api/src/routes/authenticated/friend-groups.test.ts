import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { friendGroupsRouter } from "./friend-groups.js";

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const OTHER_ID = "a0000000-0002-4000-a000-000000000001";
const GROUP_ID = "00000000-0000-4000-a000-000000000001";
const LIST_ID = "00000000-0000-4000-a000-000000000010";
const COLLECTION_ID = "00000000-0000-4000-a000-000000000020";

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
  collections?: Record<string, unknown>;
  copies?: Record<string, unknown>;
  marketplace?: Record<string, unknown>;
  userPreferences?: Record<string, unknown>;
  users?: Record<string, unknown>;
  cardTrades?: Record<string, unknown>;
  user?: { id: string };
}) {
  const friendGroups = {
    getById: vi.fn(),
    getBySlug: vi.fn(),
    // Viewer-facing routes use the alias-aware lookup; tests stub getBySlug,
    // so the default delegates at call time to whatever getBySlug resolves.
    getBySlugOrPrevious: vi.fn((slug: string) => friendGroups.getBySlug(slug)),
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
    getRevealedContactsForMembers: vi.fn(() => Promise.resolve(new Map())),
    setRevealedContacts: vi.fn(),
    transferOwnership: vi.fn(),
    getInvite: vi.fn(),
    listInvitesForUser: vi.fn(() => Promise.resolve([])),
    listOwnRequestsForUser: vi.fn(() => Promise.resolve([])),
    listRequestsForGroup: vi.fn(() => Promise.resolve([])),
    pendingInvitesCountForUser: vi.fn(() => Promise.resolve(0)),
    pendingRequestsCountForUser: vi.fn(() => Promise.resolve(0)),
    createInvite: vi.fn(),
    deleteInvite: vi.fn(),
    listSharesForGroup: vi.fn(() => Promise.resolve([])),
    listShareableForUserInGroup: vi.fn(() => Promise.resolve([])),
    listGroupsSharingList: vi.fn(() => Promise.resolve([])),
    share: vi.fn(),
    unshare: vi.fn(),
    collectionSharesForGroup: vi.fn(() => Promise.resolve([])),
    collectionShareableForUserInGroup: vi.fn(() => Promise.resolve([])),
    groupsSharingCollection: vi.fn(() => Promise.resolve([])),
    shareCollection: vi.fn(),
    unshareCollection: vi.fn(),
    getSharedCollection: vi.fn(),
    viewerCanReadCollection: vi.fn(),
    collectionsBundleForViewer: vi.fn(() => Promise.resolve([])),
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
  const collections = {
    getAccessForUser: vi.fn(),
    ...overrides.collections,
  };
  const copies = {
    listForCollection: vi.fn(() => Promise.resolve([])),
    coverPrintingsAcross: vi.fn(() => Promise.resolve([])),
    ...overrides.copies,
  };
  const marketplace = {
    singleCollectionValue: vi.fn(() => Promise.resolve(undefined)),
    ...overrides.marketplace,
  };
  const userPreferences = {
    getByUserId: vi.fn(() => Promise.resolve(undefined)),
    ...overrides.userPreferences,
  };
  const users = {
    getByEmail: vi.fn(),
    ...overrides.users,
  };
  const cardTrades = {
    countCompletedCardsInGroup: vi.fn(() => Promise.resolve(0)),
    countCompletedCardsByMemberInGroup: vi.fn(() => Promise.resolve(new Map())),
    ...overrides.cardTrades,
  };

  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    const repos = {
      friendGroups,
      friendGroupMatches,
      lists,
      collections,
      copies,
      marketplace,
      userPreferences,
      users,
      cardTrades,
    };
    c.set("user", (overrides.user ?? { id: USER_ID }) as never);
    c.set("repos", repos as never);
    // Test transact just runs the callback against the same mock repos.
    c.set("transact", (async (fn: (r: typeof repos) => unknown) => fn(repos)) as never);
    await next();
  });
  registerRouterForTest(app as never, friendGroupsRouter);
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

  return {
    app,
    friendGroups,
    friendGroupMatches,
    lists,
    collections,
    copies,
    marketplace,
    userPreferences,
    users,
  };
}

describe("friend-groups route", () => {
  // ── List + counts ───────────────────────────────────────────────────────
  it("GET / returns groups and pending invites", async () => {
    const { app } = makeApp({
      friendGroups: {
        listGroupsForUser: vi.fn(() =>
          Promise.resolve([
            {
              ...group,
              viewerRole: "owner",
              memberCount: 2,
              pendingRequestCount: 1,
              sharedListCount: 3,
              memberPreviews: [
                {
                  userId: USER_ID,
                  userName: "Owner",
                  userEmail: "owner@example.com",
                  userImage: null,
                },
              ],
            },
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
              memberCount: 2,
              memberPreviews: [
                {
                  userId: "u-other",
                  userName: "Other Owner",
                  userEmail: "other@example.com",
                  userImage: null,
                },
              ],
            },
          ]),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      items: {
        sharedListCount: number;
        memberPreviews: { userId: string; gravatarHash: string; userEmail?: string }[];
      }[];
      pendingInvites: { memberCount: number; memberPreviews: unknown[] }[];
      outgoingRequests: unknown[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].sharedListCount).toBe(3);
    // Previews are mapped to the public shape: gravatar hash instead of email.
    expect(body.items[0].memberPreviews).toHaveLength(1);
    expect(body.items[0].memberPreviews[0].userId).toBe(USER_ID);
    expect(body.items[0].memberPreviews[0].gravatarHash).toBeTruthy();
    expect(body.items[0].memberPreviews[0].userEmail).toBeUndefined();
    expect(body.pendingInvites).toHaveLength(1);
    expect(body.pendingInvites[0].memberCount).toBe(2);
    expect(body.pendingInvites[0].memberPreviews).toHaveLength(1);
    expect(body.outgoingRequests).toHaveLength(0);
  });

  it("GET / surfaces the viewer's own pending join requests in outgoingRequests", async () => {
    const { app } = makeApp({
      friendGroups: {
        listOwnRequestsForUser: vi.fn(() =>
          Promise.resolve([
            {
              id: "req-1",
              groupId: GROUP_ID,
              userId: USER_ID,
              direction: "request",
              createdAt: now,
              groupName: "Allerlei Spielerei",
              groupSlug: "allerlei-spielerei-hannover",
              memberCount: 4,
            },
          ]),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      outgoingRequests: { id: string; groupSlug: string; groupName: string }[];
    };
    expect(body.outgoingRequests).toEqual([
      {
        id: "req-1",
        groupId: GROUP_ID,
        groupSlug: "allerlei-spielerei-hannover",
        groupName: "Allerlei Spielerei",
        createdAt: now.toISOString(),
        memberCount: 4,
        memberPreviews: [],
      },
    ]);
  });

  it("GET /pending-invites-count returns the count", async () => {
    const { app } = makeApp({
      friendGroups: { pendingInvitesCountForUser: vi.fn(() => Promise.resolve(3)) },
    });
    const res = await app.request("/api/v1/friend-groups/pending-invites-count");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ count: 3 });
  });

  it("GET /pending-requests-count returns the count", async () => {
    const { app } = makeApp({
      friendGroups: { pendingRequestsCountForUser: vi.fn(() => Promise.resolve(2)) },
    });
    const res = await app.request("/api/v1/friend-groups/pending-requests-count");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ count: 2 });
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
    const body = (await readJson(res)) as { viewerStatus: string };
    expect(body.viewerStatus).toBe("available");
    // The owner's name must not leak in the join preview (shown to non-members).
    expect(body).not.toHaveProperty("ownerName");
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
    const body = (await readJson(res)) as { viewerStatus: string; members: unknown[] };
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
    const body = (await readJson(res)) as {
      viewerRole: string;
      members: unknown[];
      pendingRequests: unknown[];
    };
    expect(body.viewerRole).toBe("owner");
    expect(body.members).toHaveLength(1);
    expect(body.pendingRequests).toHaveLength(1);
  });

  it("GET /{slug} carries the group and per-member lifetime cards-traded counts", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
      },
      cardTrades: {
        countCompletedCardsInGroup: vi.fn(() => Promise.resolve(128)),
        countCompletedCardsByMemberInGroup: vi.fn(() => Promise.resolve(new Map([[USER_ID, 90]]))),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      cardsTradedCount: number;
      cardsTradedByMember: Record<string, number>;
    };
    expect(body.cardsTradedCount).toBe(128);
    expect(body.cardsTradedByMember).toEqual({ [USER_ID]: 90 });
  });

  it("GET /{slug} attaches batched cover printings to collection shares", async () => {
    const PRINTING_ID = "00000000-0000-4000-a000-000000000030";
    const IMAGE_ID = "00000000-0000-4000-a000-000000000031";
    const coverPrintingsAcross = vi.fn(() =>
      Promise.resolve([
        { collectionId: COLLECTION_ID, printingId: PRINTING_ID, imageId: IMAGE_ID },
      ]),
    );
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
        collectionSharesForGroup: vi.fn(() =>
          Promise.resolve([
            {
              groupId: GROUP_ID,
              collectionId: COLLECTION_ID,
              userId: USER_ID,
              sharedAt: now,
              collectionName: "Trade Binder",
              collectionSortOrder: 0,
              userName: "Test Owner",
              copyCount: 42,
            },
          ]),
        ),
      },
      copies: { coverPrintingsAcross },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      collectionShares: { collectionId: string; coverPrintings: unknown[] }[];
    };
    expect(coverPrintingsAcross).toHaveBeenCalledWith([COLLECTION_ID], 4);
    expect(body.collectionShares[0].coverPrintings).toEqual([
      { printingId: PRINTING_ID, imageId: IMAGE_ID },
    ]);
  });

  it("GET /{slug} expands rule-based shares so their entryCount is the real size", async () => {
    const ruledShare = {
      groupId: GROUP_ID,
      listId: LIST_ID,
      userId: USER_ID,
      sharedAt: now,
      listName: "More than 2 PS",
      listIntent: "trade",
      listKind: "copy",
      // Materialized count is 0 for a rule-only list — the bug this covers.
      entryCount: 0,
      hasRule: true,
      userName: "Test Owner",
    };
    const manualShare = {
      ...ruledShare,
      listId: "00000000-0000-4000-a000-000000000011",
      listName: "Fixed picks",
      entryCount: 4,
      hasRule: false,
    };
    const expandedCounts = vi.fn(() => Promise.resolve(new Map([[LIST_ID, 3]])));
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
        getInvite: vi.fn(() => Promise.resolve(undefined)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner])),
        listSharesForGroup: vi.fn(() => Promise.resolve([ruledShare, manualShare])),
      },
      lists: { expandedCounts },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { shares: { listId: string; entryCount: number }[] };
    const byId = new Map(body.shares.map((s) => [s.listId, s.entryCount]));
    // Rule-based list reports the expanded size, not the materialized 0.
    expect(byId.get(LIST_ID)).toBe(3);
    // Manual list keeps its cheap count and is never expanded.
    expect(byId.get(manualShare.listId)).toBe(4);
    // One batched call, carrying only the rule-based list.
    expect(expandedCounts).toHaveBeenCalledTimes(1);
    expect(expandedCounts).toHaveBeenCalledWith([LIST_ID]);
  });

  it("GET /{slug}/members/{userId} expands rule-based shares so their entryCount is the real size", async () => {
    const enrichedMember = {
      groupId: GROUP_ID,
      userId: OTHER_ID,
      role: "member" as const,
      joinedAt: now,
      userName: "Other Member",
      userEmail: "other@example.com",
      userImage: null,
    };
    const ruledShare = {
      groupId: GROUP_ID,
      listId: LIST_ID,
      userId: OTHER_ID,
      sharedAt: now,
      listName: "More than 2 PS",
      listIntent: "trade",
      listKind: "copy",
      // Materialized count is 0 for a rule-only list — the bug this covers.
      entryCount: 0,
      hasRule: true,
      userName: "Other Member",
    };
    const manualShare = {
      ...ruledShare,
      listId: "00000000-0000-4000-a000-000000000011",
      listName: "Fixed picks",
      entryCount: 4,
      hasRule: false,
    };
    const expandedCounts = vi.fn(() => Promise.resolve(new Map([[LIST_ID, 3]])));
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
        listMembers: vi.fn(() => Promise.resolve([enrichedOwner, enrichedMember])),
        listSharesForGroup: vi.fn(() => Promise.resolve([ruledShare, manualShare])),
      },
      lists: { expandedCounts },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/members/${OTHER_ID}`);
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { shares: { listId: string; entryCount: number }[] };
    const byId = new Map(body.shares.map((s) => [s.listId, s.entryCount]));
    // Rule-based list reports the expanded size, not the materialized 0.
    expect(byId.get(LIST_ID)).toBe(3);
    // Manual list keeps its cheap count and is never expanded.
    expect(byId.get(manualShare.listId)).toBe(4);
    // One batched call, carrying only the rule-based list.
    expect(expandedCounts).toHaveBeenCalledTimes(1);
    expect(expandedCounts).toHaveBeenCalledWith([LIST_ID]);
  });

  it("GET /{slug}/shareable-lists expands rule-based lists so their entryCount is the real size", async () => {
    const ruled = {
      listId: LIST_ID,
      listName: "More than 2 PS",
      listIntent: "trade",
      listKind: "copy",
      // Materialized count is 0 for a rule-only list — the bug this covers.
      entryCount: 0,
      sharedAt: null,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      hasRule: true,
    };
    const manual = {
      ...ruled,
      listId: "00000000-0000-4000-a000-000000000011",
      listName: "Fixed picks",
      entryCount: 4,
      hasRule: false,
    };
    const expandedCounts = vi.fn(() => Promise.resolve(new Map([[LIST_ID, 2]])));
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
        listShareableForUserInGroup: vi.fn(() => Promise.resolve([ruled, manual])),
      },
      lists: { expandedCounts },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/shareable-lists");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { items: { listId: string; entryCount: number }[] };
    const byId = new Map(body.items.map((i) => [i.listId, i.entryCount]));
    // Rule-based list reports the expanded size, not the materialized 0.
    expect(byId.get(LIST_ID)).toBe(2);
    // Manual list keeps its cheap count and is never expanded.
    expect(byId.get(manual.listId)).toBe(4);
    // One batched call, carrying only the rule-based list.
    expect(expandedCounts).toHaveBeenCalledTimes(1);
    expect(expandedCounts).toHaveBeenCalledWith([LIST_ID]);
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

  it("POST /{slug}/leave rejects the owner with 409", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/leave", { method: "POST" });
    expect(res.status).toBe(409);
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

  it("PATCH /{slug}/members/{userId}/role returns 409 when demoting the owner", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        // viewer resolves as owner (passes the admin gate); the target is the owner.
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/members/${OTHER_ID}/role`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE /{slug}/members/{userId} returns 409 when kicking the owner", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(ownerMembership)),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/members/${OTHER_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
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

  it("POST /{slug}/invites/{userId}/accept adds the member and consumes the invite (204)", async () => {
    const addMember = vi.fn();
    const deleteInvite = vi.fn();
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        // viewer (USER_ID) accepts their own invite
        getInvite: vi.fn(() =>
          Promise.resolve({
            id: "inv",
            groupId: GROUP_ID,
            userId: USER_ID,
            direction: "invite",
            createdAt: now,
          }),
        ),
        addMember,
        deleteInvite,
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/invites/${USER_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(204);
    expect(addMember).toHaveBeenCalledWith(group.id, USER_ID, "member");
    expect(deleteInvite).toHaveBeenCalledWith(group.id, USER_ID);
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

  // ── Collection shares ───────────────────────────────────────────────────
  it("POST /{slug}/collections shares a personal collection the viewer owns", async () => {
    const shareCollection = vi.fn(() => Promise.resolve());
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        shareCollection,
      },
      collections: {
        getAccessForUser: vi.fn(() =>
          Promise.resolve({
            collection: { id: COLLECTION_ID, userId: USER_ID },
            viewerCanAdmin: true,
          }),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(204);
    expect(shareCollection).toHaveBeenCalledWith(GROUP_ID, COLLECTION_ID, USER_ID);
  });

  it("POST /{slug}/collections rejects sharing a pooled (group-owned) collection with 404", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
      },
      // Pooled collection has userId: null, so the ownership check rejects it.
      collections: {
        getAccessForUser: vi.fn(() =>
          Promise.resolve({
            collection: { id: COLLECTION_ID, userId: null },
            viewerCanAdmin: true,
          }),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /{slug}/collections rejects sharing someone else's collection with 404", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
      },
      collections: {
        getAccessForUser: vi.fn(() =>
          Promise.resolve({
            collection: { id: COLLECTION_ID, userId: OTHER_ID },
            viewerCanAdmin: false,
          }),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /{slug}/collections/{id} unshares a collection the viewer owns", async () => {
    const unshareCollection = vi.fn(() => Promise.resolve());
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        unshareCollection,
      },
      collections: {
        getAccessForUser: vi.fn(() =>
          Promise.resolve({
            collection: { id: COLLECTION_ID, userId: USER_ID },
            viewerCanAdmin: true,
          }),
        ),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/collections/${COLLECTION_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(unshareCollection).toHaveBeenCalledWith(GROUP_ID, COLLECTION_ID);
  });

  it("GET /{slug}/collections/{id} returns the shared collection when viewer is a member", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getSharedCollection: vi.fn(() =>
          Promise.resolve({
            collection: {
              id: COLLECTION_ID,
              userId: OTHER_ID,
              name: "Friend's Binder",
              description: null,
              sortOrder: 0,
            },
            ownerName: "Friend",
            viewerRole: "member",
          }),
        ),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/collections/${COLLECTION_ID}`);
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { collection: { name: string }; viewerRole: string };
    expect(body.collection.name).toBe("Friend's Binder");
    expect(body.viewerRole).toBe("member");
  });

  // Private notes stay owner-only on personal collections shared into a group
  // (ADR-038): the route nulls notesPrivate for every viewer but the owner.
  describe("GET /{slug}/collections/{id} private notes", () => {
    const sharedCopyRow = {
      id: "a0000000-0001-4000-a000-000000000020",
      printingId: "a0000000-0001-4000-a000-000000000030",
      collectionId: COLLECTION_ID,
      groupId: null,
      onLoan: false,
      reserved: false,
      createdAt: now,
      condition: "near-mint",
      grader: null,
      grade: null,
      notesPublic: "Pack fresh",
      notesPrivate: "paid too much",
      isAltered: false,
      links: [],
    };

    const sharedBy = (ownerUserId: string) => ({
      getBySlug: vi.fn(() => Promise.resolve(group)),
      getSharedCollection: vi.fn(() =>
        Promise.resolve({
          collection: {
            id: COLLECTION_ID,
            userId: ownerUserId,
            name: "Friend's Binder",
            description: null,
            sortOrder: 0,
          },
          ownerName: "Friend",
          viewerRole: "member" as const,
        }),
      ),
    });

    it("nulls notesPrivate for a non-owner member, keeping public metadata", async () => {
      const { app } = makeApp({
        friendGroups: sharedBy(OTHER_ID),
        copies: { listForCollection: vi.fn(() => Promise.resolve([sharedCopyRow])) },
      });
      const res = await app.request(`/api/v1/friend-groups/playgroup/collections/${COLLECTION_ID}`);
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as {
        copies: {
          condition: string | null;
          notesPublic: string | null;
          notesPrivate: string | null;
        }[];
      };
      expect(body.copies[0].condition).toBe("near-mint");
      expect(body.copies[0].notesPublic).toBe("Pack fresh");
      expect(body.copies[0].notesPrivate).toBeNull();
    });

    it("keeps notesPrivate when the viewer is the collection owner", async () => {
      const { app } = makeApp({
        friendGroups: sharedBy(USER_ID),
        copies: { listForCollection: vi.fn(() => Promise.resolve([sharedCopyRow])) },
      });
      const res = await app.request(`/api/v1/friend-groups/playgroup/collections/${COLLECTION_ID}`);
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as { copies: { notesPrivate: string | null }[] };
      expect(body.copies[0].notesPrivate).toBe("paid too much");
    });
  });

  it("GET /{slug}/collections/{id} returns 404 when viewer is not a group member", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getSharedCollection: vi.fn(() => Promise.resolve(undefined)),
      },
    });
    const res = await app.request(`/api/v1/friend-groups/playgroup/collections/${COLLECTION_ID}`);
    expect(res.status).toBe(404);
  });

  it("GET /{slug}/shareable-collections returns the viewer's collections", async () => {
    const { app } = makeApp({
      friendGroups: {
        getBySlug: vi.fn(() => Promise.resolve(group)),
        getMembership: vi.fn(() => Promise.resolve(memberMembership)),
        collectionShareableForUserInGroup: vi.fn(() =>
          Promise.resolve([
            { collectionId: COLLECTION_ID, collectionName: "Binder A", sharedAt: now },
            { collectionId: "other-col", collectionName: "Binder B", sharedAt: null },
          ]),
        ),
      },
    });
    const res = await app.request("/api/v1/friend-groups/playgroup/shareable-collections");
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { items: { sharedAt: string | null }[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.sharedAt).toBe(now.toISOString());
    expect(body.items[1]?.sharedAt).toBeNull();
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
    const body = (await readJson(res)) as {
      othersHaveYourWants: unknown[];
      othersWantYourHaves: unknown[];
    };
    expect(body.othersHaveYourWants).toEqual([]);
    expect(body.othersWantYourHaves).toEqual([]);
  });
});
