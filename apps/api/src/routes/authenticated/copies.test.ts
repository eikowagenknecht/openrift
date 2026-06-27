import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { copiesRouter } from "./copies";

// ---------------------------------------------------------------------------
// Mock repo and services
// ---------------------------------------------------------------------------

const mockRepo = {
  listForAccessibleCollections: vi.fn(() => Promise.resolve([] as object[])),
};

// Every mutation returns the Postgres txid for Electric stream matching
// (ADR-027 step 2); addCopies returns it alongside the created items.
const mockAddCopies = vi.fn(() => Promise.resolve({ items: [] as object[], txid: 4242 }));
const mockMoveCopies = vi.fn(() => Promise.resolve({ txid: 4242 }));
const mockDisposeCopies = vi.fn(() => Promise.resolve({ txid: 4242 }));

// ---------------------------------------------------------------------------
// Test app — mounts the oRPC handler as production does; a pre-set user
// satisfies requireAuth (resolveSession is idempotent).
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // oxlint-disable-next-line no-explicit-any -- test stubs don't match full types
  c.set("user", { id: USER_ID } as any);
  // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  c.set("repos", { copies: mockRepo } as any);
  // oxlint-disable-next-line no-explicit-any -- test stub
  c.set("transact", (() => {}) as any);
  c.set("services", {
    addCopies: mockAddCopies,
    moveCopies: mockMoveCopies,
    disposeCopies: mockDisposeCopies,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Services type
  } as any);
  await next();
});
registerRouterForTest(app, copiesRouter);
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

const dbCopy = {
  id: "a0000000-0001-4000-a000-000000000020",
  printingId: "OGS-001:rare:normal:",
  collectionId: "a0000000-0001-4000-a000-000000000010",
  groupId: null,
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
    mockRepo.listForAccessibleCollections.mockReset();
  });

  it("returns 200 with list of copies", async () => {
    mockRepo.listForAccessibleCollections.mockResolvedValue([dbCopy]);
    const res = await app.request("/api/v1/copies");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(dbCopy.id);
    expect(json.nextCursor).toBeNull();
  });

  it("returns empty array when no copies", async () => {
    mockRepo.listForAccessibleCollections.mockResolvedValue([]);
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
    mockRepo.listForAccessibleCollections.mockResolvedValue(items);
    const res = await app.request("/api/v1/copies?limit=10");
    const json = await res.json();
    expect(json.items).toHaveLength(10);
    expect(json.nextCursor).toBeTruthy();
  });

  it("caps results at the default page size when none is provided", async () => {
    const items = Array.from({ length: 5001 }, (_, i) => ({
      ...dbCopy,
      id: `a0000000-0001-4000-a000-${String(i).padStart(12, "0")}`,
      createdAt: new Date(now.getTime() - i * 1000),
    }));
    mockRepo.listForAccessibleCollections.mockResolvedValue(items);
    const res = await app.request("/api/v1/copies");
    const json = await res.json();
    expect(json.items).toHaveLength(5000);
    expect(json.nextCursor).toBeTruthy();
  });

  it("passes cursor and limit to repo", async () => {
    mockRepo.listForAccessibleCollections.mockResolvedValue([]);
    await app.request("/api/v1/copies?limit=10&cursor=2026-03-17T00:00:00.000Z");
    expect(mockRepo.listForAccessibleCollections).toHaveBeenCalledWith(
      USER_ID,
      10,
      "2026-03-17T00:00:00.000Z",
    );
  });
});

describe("POST /api/v1/copies", () => {
  beforeEach(() => {
    mockAddCopies.mockReset();
  });

  it("returns 201 with created copies and the txid", async () => {
    const created = {
      items: [
        {
          id: COPY_ID,
          printingId: PRINTING_ID,
          collectionId: COLLECTION_ID,
          groupId: null,
        },
      ],
      txid: 4242,
    };
    mockAddCopies.mockResolvedValue(created);
    const res = await app.request("/api/v1/copies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copies: [{ id: COPY_ID, printingId: PRINTING_ID }] }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.txid).toBe(4242);
  });
});

describe("POST /api/v1/copies/move", () => {
  beforeEach(() => {
    mockMoveCopies.mockReset();
  });

  it("returns 200 with the txid on successful move", async () => {
    mockMoveCopies.mockResolvedValue({ txid: 4242 });
    const res = await app.request("/api/v1/copies/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID], toCollectionId: COLLECTION_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ txid: 4242 });
  });
});

describe("POST /api/v1/copies/dispose", () => {
  beforeEach(() => {
    mockDisposeCopies.mockReset();
  });

  it("returns 200 with the txid on successful disposal", async () => {
    mockDisposeCopies.mockResolvedValue({ txid: 4242 });
    const res = await app.request("/api/v1/copies/dispose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyIds: [COPY_ID] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ txid: 4242 });
  });
});

describe("POST /api/v1/copies — service arguments", () => {
  beforeEach(() => {
    mockAddCopies.mockReset();
  });

  it("passes repos, transact, userId, and copies to addCopies service", async () => {
    mockAddCopies.mockResolvedValue({ items: [], txid: 4242 });
    const copies = [{ id: COPY_ID, printingId: PRINTING_ID, collectionId: COLLECTION_ID }];
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
    mockMoveCopies.mockResolvedValue({ txid: 4242 });
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
    mockDisposeCopies.mockResolvedValue({ txid: 4242 });
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
    mockRepo.listForAccessibleCollections.mockReset();
  });

  it("passes the default page size to the repo when no limit is provided", async () => {
    mockRepo.listForAccessibleCollections.mockResolvedValue([]);
    await app.request("/api/v1/copies");
    expect(mockRepo.listForAccessibleCollections).toHaveBeenCalledWith(USER_ID, 5000, undefined);
  });
});
