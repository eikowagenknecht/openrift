import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { collectionsRouter } from "./collections";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockCollectionsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  listAccessibleForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getAccessForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  filterWritableByViewer: vi.fn(() => Promise.resolve([] as string[])),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  updateById: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getIdAndName: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  listCopiesInCollection: vi.fn(() => Promise.resolve([] as object[])),
  moveCopiesBetweenCollections: vi.fn(() => Promise.resolve()),
  deleteByIdForUser: vi.fn(() => Promise.resolve()),
  deleteById: vi.fn(() => Promise.resolve()),
  setShareToken: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  setShareTokenById: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  nextPersonalSortOrder: vi.fn(() => Promise.resolve(0)),
  reorderPersonal: vi.fn(() => Promise.resolve()),
};

const mockFriendGroupsRepo = {
  getBySlug: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  // The route resolves rename aliases via the alias-aware lookup; delegate to
  // the getBySlug stub so tests keep configuring one mock.
  getBySlugOrPrevious: vi.fn((slug: string) => mockFriendGroupsRepo.getBySlug(slug)),
  getMembership: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockCopiesRepo = {
  listForCollection: vi.fn(() => Promise.resolve([] as object[])),
};

const mockUserPreferencesRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined)),
};

const mockMarketplaceRepo = {
  collectionValues: vi.fn(() => Promise.resolve(new Map())),
  singleCollectionValue: vi.fn(() => Promise.resolve(undefined)),
};

const mockEnsureInbox = vi.fn(() => Promise.resolve("inbox-id"));
const mockDeleteCollection = vi.fn(() => Promise.resolve());

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("transact", (() => {}) as never);
  c.set("repos", {
    collections: mockCollectionsRepo,
    copies: mockCopiesRepo,
    marketplace: mockMarketplaceRepo,
    userPreferences: mockUserPreferencesRepo,
    friendGroups: mockFriendGroupsRepo,
  } as never);
  c.set("services", {
    ensureInbox: mockEnsureInbox,
    deleteCollection: mockDeleteCollection,
  } as never);
  await next();
});
registerRouterForTest(app, collectionsRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbCollection = {
  id: "a0000000-0001-4000-a000-000000000010",
  userId: USER_ID,
  groupId: null,
  name: "Main Binder",
  description: "My main collection",
  isInbox: false,
  availableForDeckbuilding: true,
  sortOrder: 0,
  isPublic: false,
  shareToken: null,
  createdAt: now,
  updatedAt: now,
};

const dbInbox = {
  ...dbCollection,
  id: "a0000000-0001-4000-a000-000000000011",
  name: "Inbox",
  isInbox: true,
};

const dbSharedCollection = {
  id: "a0000000-0001-4000-a000-000000000050",
  userId: null,
  groupId: "a0000000-0001-4000-a000-000000000040",
  name: "Friday Night Pool",
  description: null,
  isInbox: false,
  availableForDeckbuilding: true,
  sortOrder: 0,
  isPublic: false,
  shareToken: null,
  createdAt: now,
  updatedAt: now,
};

function access(
  collection: typeof dbCollection | typeof dbSharedCollection,
  viewerCanAdmin = true,
) {
  return {
    collection: { ...collection, groupSlug: null, groupName: null },
    viewerRole: viewerCanAdmin ? ("owner" as const) : ("member" as const),
    viewerCanAdmin,
  };
}

const dbCopy = {
  id: "a0000000-0001-4000-a000-000000000020",
  printingId: "OGS-001:rare:normal:",
  collectionId: dbCollection.id,
  groupId: null,
  createdAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.listAccessibleForUser.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("returns 200 with list of personal + shared collections", async () => {
    mockCollectionsRepo.listAccessibleForUser.mockResolvedValue([
      { ...dbInbox, groupSlug: null, groupName: null, viewerCanAdmin: true, copyCount: 0 },
      { ...dbCollection, groupSlug: null, groupName: null, viewerCanAdmin: true, copyCount: 0 },
      {
        ...dbSharedCollection,
        groupSlug: "friday-night",
        groupName: "Friday Night",
        viewerCanAdmin: false,
        copyCount: 0,
      },
    ]);
    const res = await app.request("/api/v1/collections");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(3);
    expect(json.items[0].name).toBe("Inbox");
    expect(json.items[2].groupSlug).toBe("friday-night");
    expect(json.items[2].viewerCanAdmin).toBe(false);
  });

  it("no longer calls ensureInbox (moved to account creation)", async () => {
    mockCollectionsRepo.listAccessibleForUser.mockResolvedValue([]);
    await app.request("/api/v1/collections");
    expect(mockEnsureInbox).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.create.mockReset();
    mockFriendGroupsRepo.getBySlug.mockReset();
    mockFriendGroupsRepo.getMembership.mockReset();
  });

  it("returns 201 with created personal collection", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main Binder" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Main Binder");
    expect(mockCollectionsRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      groupId: null,
      name: "Main Binder",
      description: null,
      isInbox: false,
      sortOrder: 0,
    });
  });

  it("creates a shared collection when groupSlug is provided and the user is a member", async () => {
    mockFriendGroupsRepo.getBySlug.mockResolvedValue({
      id: dbSharedCollection.groupId,
      slug: "friday-night",
      name: "Friday Night",
    });
    mockFriendGroupsRepo.getMembership.mockResolvedValue({ role: "owner" });
    mockCollectionsRepo.create.mockResolvedValue(dbSharedCollection);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pool", groupSlug: "friday-night" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.groupSlug).toBe("friday-night");
    expect(mockCollectionsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, groupId: dbSharedCollection.groupId }),
    );
  });

  it("returns 403 when groupSlug is provided but the user is not a member", async () => {
    mockFriendGroupsRepo.getBySlug.mockResolvedValue({
      id: "g",
      slug: "friday-night",
      name: "Friday Night",
    });
    mockFriendGroupsRepo.getMembership.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pool", groupSlug: "friday-night" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when groupSlug does not match any group", async () => {
    mockFriendGroupsRepo.getBySlug.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pool", groupSlug: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
  });

  it("returns 200 with collection when accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(dbCollection.id);
    expect(json.viewerCanAdmin).toBe(true);
  });

  it("returns 404 when not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
    mockCollectionsRepo.updateById.mockReset();
  });

  it("returns 200 with updated collection", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    const updated = { ...dbCollection, name: "Renamed" };
    mockCollectionsRepo.updateById.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Renamed");
  });

  it("returns 403 when viewer is not an admin of a shared collection", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbSharedCollection, false));
    const res = await app.request(`/api/v1/collections/${dbSharedCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(403);
    expect(mockCollectionsRepo.updateById).not.toHaveBeenCalled();
  });

  it("returns 404 when not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
    mockCollectionsRepo.listCopiesInCollection.mockReset();
    mockCollectionsRepo.deleteById.mockReset();
    mockDeleteCollection.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("returns 204 and auto-moves copies to inbox (personal)", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockEnsureInbox).toHaveBeenCalled();
    expect(mockDeleteCollection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        collectionId: dbCollection.id,
        moveCopiesTo: "inbox-id",
        targetName: "Inbox",
        userId: USER_ID,
      }),
    );
  });

  it("deletes an empty shared collection without involving inbox", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbSharedCollection));
    mockCollectionsRepo.listCopiesInCollection.mockResolvedValue([]);
    const res = await app.request(`/api/v1/collections/${dbSharedCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockCollectionsRepo.deleteById).toHaveBeenCalledWith(dbSharedCollection.id);
    expect(mockEnsureInbox).not.toHaveBeenCalled();
  });

  it("returns 409 when trying to delete a non-empty shared collection", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbSharedCollection));
    mockCollectionsRepo.listCopiesInCollection.mockResolvedValue([{ id: "c", printingId: "p" }]);
    const res = await app.request(`/api/v1/collections/${dbSharedCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    expect(mockCollectionsRepo.deleteById).not.toHaveBeenCalled();
  });

  it("returns 403 when viewer is not an admin of the shared collection", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbSharedCollection, false));
    const res = await app.request(`/api/v1/collections/${dbSharedCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when trying to delete inbox", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbInbox));
    const res = await app.request(`/api/v1/collections/${dbInbox.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/collections/:id/copies", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
    mockCopiesRepo.listForCollection.mockReset();
  });

  it("returns 200 with copies", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    mockCopiesRepo.listForCollection.mockResolvedValue([dbCopy]);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(dbCopy.id);
    expect(json.nextCursor).toBeNull();
  });

  it("returns 404 when collection not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(404);
  });

  it("returns nextCursor when hasMore copies with explicit limit", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    const items = Array.from({ length: 11 }, (_, idx) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 1000),
    }));
    mockCopiesRepo.listForCollection.mockResolvedValue(items);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies?limit=10`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(10);
    expect(json.nextCursor).toBeTruthy();
  });

  it("passes the default page size to the repo when no limit is provided", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    mockCopiesRepo.listForCollection.mockResolvedValue([]);
    await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(mockCopiesRepo.listForCollection).toHaveBeenCalledWith(dbCollection.id, 5000, undefined);
  });
});

describe("POST /api/v1/collections/:id/share", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
    mockCollectionsRepo.setShareTokenById.mockReset();
  });

  it("returns 200 with a fresh share token and isPublic=true", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    const shared = { ...dbCollection, isPublic: true, shareToken: "will-be-replaced" };
    mockCollectionsRepo.setShareTokenById.mockResolvedValue(shared);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/share`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.shareToken).toMatch(/^[A-Za-z0-9]{12}$/u);
    expect(json.isPublic).toBe(true);
    expect(mockCollectionsRepo.setShareTokenById).toHaveBeenCalledWith(
      dbCollection.id,
      json.shareToken,
      true,
    );
  });

  it("returns 404 when the collection is not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/share`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when viewer is not an admin of the shared collection", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbSharedCollection, false));
    const res = await app.request(`/api/v1/collections/${dbSharedCollection.id}/share`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/v1/collections/:id/share", () => {
  beforeEach(() => {
    mockCollectionsRepo.getAccessForUser.mockReset();
    mockCollectionsRepo.setShareTokenById.mockReset();
  });

  it("returns 204 and nulls the token + isPublic=false", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(access(dbCollection));
    mockCollectionsRepo.setShareTokenById.mockResolvedValue({
      ...dbCollection,
      isPublic: false,
      shareToken: null,
    });
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/share`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockCollectionsRepo.setShareTokenById).toHaveBeenCalledWith(
      dbCollection.id,
      null,
      false,
    );
  });

  it("returns 404 when the collection is not accessible", async () => {
    mockCollectionsRepo.getAccessForUser.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/share`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/collections/reorder", () => {
  beforeEach(() => {
    mockCollectionsRepo.reorderPersonal.mockReset();
    mockCollectionsRepo.reorderPersonal.mockResolvedValue(undefined);
  });

  it("returns 204 and forwards orderedIds to the repo", async () => {
    const orderedIds = [
      "a0000000-0001-4000-a000-000000000010",
      "a0000000-0001-4000-a000-000000000011",
    ];
    const res = await app.request("/api/v1/collections/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    expect(res.status).toBe(204);
    expect(mockCollectionsRepo.reorderPersonal).toHaveBeenCalledWith(USER_ID, orderedIds);
  });

  it("returns 400 when orderedIds is empty", async () => {
    const res = await app.request("/api/v1/collections/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: [] }),
    });
    expect(res.status).toBe(400);
    expect(mockCollectionsRepo.reorderPersonal).not.toHaveBeenCalled();
  });
});
