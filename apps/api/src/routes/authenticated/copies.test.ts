import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { copiesRoute } from "./copies";

// ---------------------------------------------------------------------------
// Mock repo and services
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  countByCollectionForUser: vi.fn(() =>
    Promise.resolve(
      [] as {
        printingId: string;
        collectionId: string;
        collectionName: string;
        count: number;
      }[],
    ),
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
  createdAt: now,
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

  it("returns nextCursor when hasMore with explicit limit", async () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(i).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - i * 1000),
    }));
    mockRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/copies?limit=10");
    const json = await res.json();
    expect(json.items).toHaveLength(10);
    expect(json.nextCursor).toBeTruthy();
  });

  it("caps results at default 500 limit when none is provided", async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(i).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - i * 1000),
    }));
    mockRepo.listForUser.mockResolvedValue(items);
    const res = await app.request("/api/v1/copies");
    const json = await res.json();
    expect(json.items).toHaveLength(500);
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

describe("GET /api/v1/copies/count-by-collection", () => {
  beforeEach(() => {
    mockRepo.countByCollectionForUser.mockReset();
  });

  it("returns 200 with printingId → breakdown entries map", async () => {
    mockRepo.countByCollectionForUser.mockResolvedValue([
      {
        printingId: "OGS-001:rare:normal:",
        collectionId: "col-1",
        collectionName: "Main",
        count: 2,
      },
      {
        printingId: "OGS-001:rare:normal:",
        collectionId: "col-2",
        collectionName: "Trades",
        count: 1,
      },
      {
        printingId: "OGS-002:common:normal:",
        collectionId: "col-1",
        collectionName: "Main",
        count: 1,
      },
    ]);
    const res = await app.request("/api/v1/copies/count-by-collection");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items["OGS-001:rare:normal:"]).toEqual([
      { collectionId: "col-1", collectionName: "Main", count: 2 },
      { collectionId: "col-2", collectionName: "Trades", count: 1 },
    ]);
    expect(json.items["OGS-002:common:normal:"]).toEqual([
      { collectionId: "col-1", collectionName: "Main", count: 1 },
    ]);
  });

  it("returns empty object when no copies", async () => {
    mockRepo.countByCollectionForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/copies/count-by-collection");
    const json = await res.json();
    expect(json.items).toEqual({});
  });
});

describe("POST /api/v1/copies — service arguments", () => {
  beforeEach(() => {
    mockAddCopies.mockReset();
  });

  it("passes repos, transact, userId, and copies to addCopies service", async () => {
    mockAddCopies.mockResolvedValue([]);
    const copies = [{ printingId: PRINTING_ID, collectionId: COLLECTION_ID }];
    await app.request("/api/v1/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copies }),
    });
    expect(mockAddCopies).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      USER_ID,
      copies,
    );
  });
});

describe("POST /api/v1/copies/move — service arguments", () => {
  beforeEach(() => {
    mockMoveCopies.mockReset();
  });

  it("passes repos, transact, userId, copyIds, and toCollectionId to moveCopies service", async () => {
    mockMoveCopies.mockResolvedValue(undefined);
    const copyIds = [COPY_ID];
    await app.request("/api/v1/copies/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds, toCollectionId: COLLECTION_ID }),
    });
    expect(mockMoveCopies).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      USER_ID,
      copyIds,
      COLLECTION_ID,
    );
  });
});

describe("POST /api/v1/copies/dispose — service arguments", () => {
  beforeEach(() => {
    mockDisposeCopies.mockReset();
  });

  it("passes transact, userId, and copyIds to disposeCopies service", async () => {
    mockDisposeCopies.mockResolvedValue(undefined);
    const copyIds = [COPY_ID];
    await app.request("/api/v1/copies/dispose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds }),
    });
    expect(mockDisposeCopies).toHaveBeenCalledWith(expect.anything(), USER_ID, copyIds);
  });
});

describe("GET /api/v1/copies — default limit", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("passes default limit of 500 to repo when none provided", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    await app.request("/api/v1/copies");
    expect(mockRepo.listForUser).toHaveBeenCalledWith(USER_ID, 500, undefined);
  });
});
