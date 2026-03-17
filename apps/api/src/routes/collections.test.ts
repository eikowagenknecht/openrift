import { describe, expect, it, mock, beforeEach } from "bun:test";

import { Hono } from "hono";

import { AppError } from "../errors.js";
import { collectionsRoute } from "./collections";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockCollectionsRepo = {
  listForUser: mock(() => Promise.resolve([] as object[])),
  create: mock(() => Promise.resolve({} as object)),
  getByIdForUser: mock(() => Promise.resolve(undefined as object | undefined)),
  update: mock(() => Promise.resolve(undefined as object | undefined)),
  getIdAndName: mock(() => Promise.resolve(undefined as object | undefined)),
  exists: mock(() => Promise.resolve(undefined as object | undefined)),
};

const mockCopiesRepo = {
  listForCollection: mock(() => Promise.resolve([] as object[])),
};

const mockEnsureInbox = mock(() => Promise.resolve("inbox-id"));

// Tracks transaction operations
const mockTrxOps = {
  selectExecute: mock(() => Promise.resolve([] as object[])),
  updateExecute: mock(() => Promise.resolve()),
  deleteExecute: mock(() => Promise.resolve()),
  insertExecute: mock(() => Promise.resolve()),
};

const mockDb = {
  transaction: () => ({
    execute: (fn: (trx: object) => Promise<void>) => {
      const trx = {
        selectFrom: () => ({
          select: () => ({
            where: () => ({
              execute: mockTrxOps.selectExecute,
            }),
          }),
        }),
        updateTable: () => ({
          set: () => ({
            where: () => ({
              execute: mockTrxOps.updateExecute,
            }),
          }),
        }),
        deleteFrom: () => ({
          where: () => ({
            where: () => ({
              execute: mockTrxOps.deleteExecute,
            }),
          }),
        }),
        insertInto: () => ({
          values: () => ({
            execute: mockTrxOps.insertExecute,
          }),
        }),
      };
      return fn(trx);
    },
  }),
};

mock.module("../repositories/collections.js", () => ({
  collectionsRepo: () => mockCollectionsRepo,
}));

mock.module("../repositories/copies.js", () => ({
  copiesRepo: () => mockCopiesRepo,
}));

mock.module("../services/inbox.js", () => ({
  ensureInbox: mockEnsureInbox,
}));

mock.module("../services/activity-logger.js", () => ({
  createActivity: mock(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db", mockDb as never);
    c.set("user", { id: USER_ID });
    await next();
  })
  .route("/api", collectionsRoute)
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
  sourceId: null,
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

describe("GET /api/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.listForUser.mockReset();
    mockEnsureInbox.mockReset();
    mockEnsureInbox.mockResolvedValue("inbox-id");
  });

  it("returns 200 with list of collections", async () => {
    mockCollectionsRepo.listForUser.mockResolvedValue([dbInbox, dbCollection]);
    const res = await app.request("/api/collections");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].name).toBe("Inbox");
  });

  it("calls ensureInbox before listing", async () => {
    mockCollectionsRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/collections");
    expect(mockEnsureInbox).toHaveBeenCalled();
  });
});

describe("POST /api/collections", () => {
  beforeEach(() => {
    mockCollectionsRepo.create.mockReset();
  });

  it("returns 201 with created collection", async () => {
    mockCollectionsRepo.create.mockResolvedValue(dbCollection);
    const res = await app.request("/api/collections", {
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
    const res = await app.request("/api/collections", {
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

describe("GET /api/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getByIdForUser.mockReset();
  });

  it("returns 200 with collection when found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    const res = await app.request(`/api/collections/${dbCollection.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(dbCollection.id);
  });

  it("returns 404 when not found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/collections/${dbCollection.id}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.update.mockReset();
  });

  it("returns 200 with updated collection", async () => {
    const updated = { ...dbCollection, name: "Renamed" };
    mockCollectionsRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/collections/${dbCollection.id}`, {
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
    const res = await app.request(`/api/collections/${dbCollection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/collections/:id", () => {
  beforeEach(() => {
    mockCollectionsRepo.getByIdForUser.mockReset();
    mockCollectionsRepo.getIdAndName.mockReset();
    mockTrxOps.selectExecute.mockReset();
    mockTrxOps.updateExecute.mockReset();
    mockTrxOps.deleteExecute.mockReset();
  });

  const targetId = "a0000000-0001-4000-a000-000000000012";

  it("returns 204 when deleted with copies moved", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    mockCollectionsRepo.getIdAndName.mockResolvedValue({ id: targetId, name: "Target" });
    mockTrxOps.selectExecute.mockResolvedValue([{ id: "copy-1", printingId: "p1" }]);
    const res = await app.request(
      `/api/collections/${dbCollection.id}?move_copies_to=${targetId}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);
  });

  it("returns 204 when deleted with no copies to move", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    mockCollectionsRepo.getIdAndName.mockResolvedValue({ id: targetId, name: "Target" });
    mockTrxOps.selectExecute.mockResolvedValue([]);
    const res = await app.request(
      `/api/collections/${dbCollection.id}?move_copies_to=${targetId}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(204);
  });

  it("returns 404 when collection not found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(
      `/api/collections/${dbCollection.id}?move_copies_to=${targetId}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when trying to delete inbox", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbInbox);
    const res = await app.request(`/api/collections/${dbInbox.id}?move_copies_to=${targetId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when move_copies_to is missing", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    const res = await app.request(`/api/collections/${dbCollection.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when move_copies_to equals collection id", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    const res = await app.request(
      `/api/collections/${dbCollection.id}?move_copies_to=${dbCollection.id}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when target collection not found", async () => {
    mockCollectionsRepo.getByIdForUser.mockResolvedValue(dbCollection);
    mockCollectionsRepo.getIdAndName.mockResolvedValue();
    const res = await app.request(
      `/api/collections/${dbCollection.id}?move_copies_to=${targetId}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/collections/:id/copies", () => {
  beforeEach(() => {
    mockCollectionsRepo.exists.mockReset();
    mockCopiesRepo.listForCollection.mockReset();
  });

  it("returns 200 with copies", async () => {
    mockCollectionsRepo.exists.mockResolvedValue({ id: dbCollection.id });
    mockCopiesRepo.listForCollection.mockResolvedValue([dbCopy]);
    const res = await app.request(`/api/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe(dbCopy.id);
  });

  it("returns 404 when collection not found", async () => {
    mockCollectionsRepo.exists.mockResolvedValue();
    const res = await app.request(`/api/collections/${dbCollection.id}/copies`);
    expect(res.status).toBe(404);
  });
});
