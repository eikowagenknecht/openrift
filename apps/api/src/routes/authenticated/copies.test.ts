import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { copiesRoute } from "./copies";

// ---------------------------------------------------------------------------
// Mock repo and services
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  countByPrintingForUser: vi.fn(() =>
    Promise.resolve([] as { printingId: string; count: number }[]),
  ),
};

const mockAddCopies = vi.fn(() => Promise.resolve([] as object[]));
const mockMoveCopies = vi.fn(() => Promise.resolve());
const mockDisposeCopies = vi.fn(() => Promise.resolve());

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { copies: mockRepo } as never);
    c.set("transact", (() => {}) as never);
    c.set("services", {
      addCopies: mockAddCopies,
      moveCopies: mockMoveCopies,
      disposeCopies: mockDisposeCopies,
    } as never);
    await next();
  })
  .route("/api/v1", copiesRoute)
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

const dbCopy = {
  id: "a0000000-0001-4000-a000-000000000020",
  printingId: "OGS-001:rare:normal:",
  collectionId: "a0000000-0001-4000-a000-000000000010",
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

const COPY_ID = "a0000000-0001-4000-a000-000000000020";
const PRINTING_ID = "a0000000-0001-4000-a000-000000000030";
const COLLECTION_ID = "a0000000-0001-4000-a000-000000000010";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/copies", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with list of copies", async () => {
    mockRepo.listForUser.mockResolvedValue([dbCopy]);
    const res = await app.request("/api/v1/copies");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(dbCopy.id);
    expect(json.nextCursor).toBeNull();
  });

  it("returns empty array when no copies", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/copies");
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(json.nextCursor).toBeNull();
  });

  it("returns nextCursor when hasMore", async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(i).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - i * 1000),
    }));
    mockRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/copies");
    const json = await res.json();
    expect(json.items).toHaveLength(200);
    expect(json.nextCursor).toBeTruthy();
  });

  it("passes cursor and limit to repo", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/copies?limit=10&cursor=2026-03-17T00:00:00.000Z");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, 10, "2026-03-17T00:00:00.000Z");
  });
});

describe("POST /api/v1/copies", () => {
  beforeEach(() => {
    mockAddCopies.mockReset();
  });

  it("returns 201 with created copies", async () => {
    const created = [
      {
        id: COPY_ID,
        printingId: PRINTING_ID,
        collectionId: COLLECTION_ID,
        acquisitionSourceId: null,
      },
    ];
    mockAddCopies.mockResolvedValue(created);
    const res = await app.request("/api/v1/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copies: [{ printingId: PRINTING_ID }] }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toHaveLength(1);
  });
});

describe("POST /api/v1/copies/move", () => {
  beforeEach(() => {
    mockMoveCopies.mockReset();
  });

  it("returns 204 on successful move", async () => {
    mockMoveCopies.mockResolvedValue();
    const res = await app.request("/api/v1/copies/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID], toCollectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(204);
  });
});

describe("POST /api/v1/copies/dispose", () => {
  beforeEach(() => {
    mockDisposeCopies.mockReset();
  });

  it("returns 204 on successful disposal", async () => {
    mockDisposeCopies.mockResolvedValue();
    const res = await app.request("/api/v1/copies/dispose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(204);
  });
});

describe("GET /api/v1/copies/count", () => {
  beforeEach(() => {
    mockRepo.countByPrintingForUser.mockReset();
  });

  it("returns 200 with printingId→count map", async () => {
    mockRepo.countByPrintingForUser.mockResolvedValue([
      { printingId: "OGS-001:rare:normal:", count: 3 },
      { printingId: "OGS-002:common:normal:", count: 1 },
    ]);
    const res = await app.request("/api/v1/copies/count");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items["OGS-001:rare:normal:"]).toBe(3);
    expect(json.items["OGS-002:common:normal:"]).toBe(1);
  });

  it("returns empty object when no copies", async () => {
    mockRepo.countByPrintingForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/copies/count");
    const json = await res.json();
    expect(json.items).toEqual({});
  });
});

describe("GET /api/v1/copies/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
  });

  it("returns 200 with copy when found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbCopy);
    const res = await app.request(`/api/v1/copies/${dbCopy.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(dbCopy.id);
    expect(json.cardName).toBe("Fire Dragon");
  });

  it("returns 404 when copy not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/copies/${dbCopy.id}`);
    expect(res.status).toBe(404);
  });
});
