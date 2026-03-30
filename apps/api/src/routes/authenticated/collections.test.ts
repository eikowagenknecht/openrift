import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { collectionsRoute } from "./collections";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockCollectionsRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  getIdAndName: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  exists: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  listCopiesInCollection: vi.fn(() => Promise.resolve([] as object[])),
  moveCopiesBetweenCollections: vi.fn(() => Promise.resolve()),
  deleteByIdForUser: vi.fn(() => Promise.resolve()),
};

const mockCopiesRepo = {
  listForCollection: vi.fn(() => Promise.resolve([] as object[])),
};

const mockUserPreferencesRepo = {
  getByUserId: vi.fn(() => Promise.resolve(undefined)),
};

const mockMarketplaceRepo = {
  collectionValues: vi.fn(() => Promise.resolve(new Map())),
};

const mockEnsureInbox = vi.fn(() => Promise.resolve("inbox-id"));
const mockDeleteCollection = vi.fn(() => Promise.resolve());

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("transact", (() => {}) as never);
    c.set("repos", {
      collections: mockCollectionsRepo,
      copies: mockCopiesRepo,
      marketplace: mockMarketplaceRepo,
      userPreferences: mockUserPreferencesRepo,
    } as never);
    c.set("services", {
      ensureInbox: mockEnsureInbox,
      deleteCollection: mockDeleteCollection,
    } as never);
    await next();
  })
  .route("/api/v1", collectionsRoute)
  .onError((err, c) => {
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
  name: "Main Binder",
  description: "My main collection",
  isInbox: false,
  availableForDeckbuilding: true,
  sortOrder: 0,
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

const dbCopy = {
  id: "a0000000-0001-4000-a000-000000000020",
  printingId: "OGS-001:rare:normal:",
  collectionId: dbCollection.id,
  acquisitionSourceId: null,
  createdAt: now,
  updatedAt: now,
  cardId: "OGS-001",
  setId: "OGS",
  collectorNumber: 1,
  rarity: "Rare",
  artVariant: "normal",
  isSigned: false,
  finish: "normal",
  artist: "Alice",
  imageUrl: "https://example.com/img.jpg",
  cardName: "Fire Dragon",
  cardType: "Unit",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.listForUser.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("returns 200 with list of collections", async () => {
    mockCollectionsRepo.listForUser.mockResolvedValue([dbInbox, dbCollection]);
    const res = await app.request("/api/v1/collections");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].name).toBe("Inbox");
  });

  it("calls ensureInbox before listing", async () => {
    mockCollectionsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/collections");
    expect(mockEnsureInbox).toHaveBeenCalled();
  });
});

describe("POST /api/v1/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.create.mockReset();
  });

  it("returns 201 with created collection", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Main Binder" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Main Binder");
  });

  it("creates with description and availableForDeckbuilding", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    const res = await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Main Binder",
        description: "My main collection",
        availableForDeckbuilding: false,
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getByIdForUser.mockReset();
  });

  it("returns 200 with collection when found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(dbCollection.id);
  });

  it("returns 404 when not found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.update.mockReset();
  });

  it("returns 200 with updated collection", async () => {
    const updated = { ...dbCollection, name: "Renamed" };
    mockCollectionsRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Renamed");
  });

  it("returns 404 when not found", async () => {
    mockCollectionsRepo.update.mockResolvedValue();
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
    mockCollectionsRepo.getByIdForUser.mockReset();
    mockDeleteCollection.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("returns 204 and auto-moves copies to inbox", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
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

  it("returns 404 when collection not found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when trying to delete inbox", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbInbox);
    const res = await app.request(`/api/v1/collections/${dbInbox.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/collections/:id/copies", () => {
  beforeEach(() => {
    mockCollectionsRepo.exists.mockReset();
    mockCopiesRepo.listForCollection.mockReset();
  });

  it("returns 200 with copies", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    mockCopiesRepo.listForCollection.mockResolvedValue([dbCopy]);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(dbCopy.id);
    expect(json.nextCursor).toBeNull();
  });

  it("returns 404 when collection not found", async () => {
    mockCollectionsRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(404);
  });

  it("returns nextCursor when hasMore copies", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    const items = Array.from({ length: 201 }, (_, idx) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 1000),
    }));
    mockCopiesRepo.listForCollection.mockResolvedValue(items);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(200);
    expect(json.nextCursor).toBeTruthy();
  });

  it("passes cursor and limit query params", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);
    await app.request(
      `/api/v1/collections/${dbCollection.id}/copies?limit=10&cursor=2026-03-17T00:00:00.000Z`,
    );
    expect(mockCopiesRepo.listForCollection).toHaveBeenCalledWith(
      dbCollection.id,
      10,
      "2026-03-17T00:00:00.000Z",
    );
  });

  it("defaults limit to 200 when not provided", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    mockCopiesRepo.listForCollection.mockResolvedValue([]);
    await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    expect(mockCopiesRepo.listForCollection).toHaveBeenCalledWith(dbCollection.id, 200, undefined);
  });

  it("returns null nextCursor when items exactly equal limit", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    const items = Array.from({ length: 200 }, (_, idx) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(idx).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - idx * 1000),
    }));
    mockCopiesRepo.listForCollection.mockResolvedValue(items);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}/copies`);
    const json = await res.json();
    expect(json.items).toHaveLength(200);
    expect(json.nextCursor).toBeNull();
  });
});

describe("POST /api/v1/collections — argument passing", () => {
  beforeEach(() => {
    mockCollectionsRepo.create.mockReset();
  });

  it("passes correct defaults to repo.create", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Collection" }),
    });
    expect(mockCollectionsRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "New Collection",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
    });
  });

  it("passes explicit description and availableForDeckbuilding", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    await app.request("/api/v1/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Trade Binder",
        description: "Cards for trade",
        availableForDeckbuilding: false,
      }),
    });
    expect(mockCollectionsRepo.create).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "Trade Binder",
      description: "Cards for trade",
      availableForDeckbuilding: false,
      isInbox: false,
      sortOrder: 0,
    });
  });
});

describe("DELETE /api/v1/collections/:id — argument details", () => {
  beforeEach(() => {
    mockCollectionsRepo.getByIdForUser.mockReset();
    mockDeleteCollection.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("passes collectionName from the fetched collection", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    await app.request(`/api/v1/collections/${dbCollection.id}`, { method: "DELETE" });
    expect(mockDeleteCollection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        collectionName: "Main Binder",
      }),
    );
  });
});

describe("PATCH /api/v1/collections/:id — field updates", () => {
  beforeEach(() => {
    mockCollectionsRepo.update.mockReset();
  });

  it("updates sortOrder field", async () => {
    const updated = { ...dbCollection, sortOrder: 5 };
    mockCollectionsRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder: 5 }),
    });
    expect(res.status).toBe(200);
    expect(mockCollectionsRepo.update).toHaveBeenCalledWith(dbCollection.id, USER_ID, {
      sortOrder: 5,
    });
  });

  it("updates availableForDeckbuilding field", async () => {
    const updated = { ...dbCollection, availableForDeckbuilding: false };
    mockCollectionsRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availableForDeckbuilding: false }),
    });
    expect(res.status).toBe(200);
  });

  it("updates description field", async () => {
    const updated = { ...dbCollection, description: "Updated description" };
    mockCollectionsRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated description" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.description).toBe("Updated description");
  });
});
