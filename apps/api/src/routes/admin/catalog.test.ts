import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { catalogRoute } from "./catalog";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockSetsRepo = {
  listAll: vi.fn(),
  cardCountsBySet: vi.fn(),
  printingCountsBySet: vi.fn(),
  update: vi.fn(),
  createIfNotExists: vi.fn(),
  printingCount: vi.fn(),
  deleteById: vi.fn(),
  reorder: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { sets: mockSetsRepo } as never);
    await next();
  })
  .route("/api/v1", catalogRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const setId1 = "a0000000-0001-4000-a000-000000000010";
const setId2 = "a0000000-0001-4000-a000-000000000020";

const dbSet1 = {
  id: setId1,
  slug: "origin-set",
  name: "Origin Set",
  printedTotal: 100,
  sortOrder: 0,
  releasedAt: "2026-01-01",
};

const dbSet2 = {
  id: setId2,
  slug: "second-set",
  name: "Second Set",
  printedTotal: null,
  sortOrder: 1,
  releasedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/sets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with sets including card and printing counts", async () => {
    mockSetsRepo.listAll.mockResolvedValue([dbSet1, dbSet2]);
    mockSetsRepo.cardCountsBySet.mockResolvedValue([{ setId: setId1, cardCount: 50 }]);
    mockSetsRepo.printingCountsBySet.mockResolvedValue([
      { setId: setId1, printingCount: 75 },
      { setId: setId2, printingCount: 10 },
    ]);

    const res = await app.request("/api/v1/sets");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets).toHaveLength(2);
    expect(json.sets[0]).toEqual({
      id: setId1,
      slug: "origin-set",
      name: "Origin Set",
      printedTotal: 100,
      sortOrder: 0,
      releasedAt: "2026-01-01",
      cardCount: 50,
      printingCount: 75,
    });
    expect(json.sets[1]).toEqual({
      id: setId2,
      slug: "second-set",
      name: "Second Set",
      printedTotal: null,
      sortOrder: 1,
      releasedAt: null,
      cardCount: 0,
      printingCount: 10,
    });
  });

  it("defaults cardCount and printingCount to 0 when not in maps", async () => {
    mockSetsRepo.listAll.mockResolvedValue([dbSet2]);
    mockSetsRepo.cardCountsBySet.mockResolvedValue([]);
    mockSetsRepo.printingCountsBySet.mockResolvedValue([]);

    const res = await app.request("/api/v1/sets");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets[0].cardCount).toBe(0);
    expect(json.sets[0].printingCount).toBe(0);
  });
});

describe("PATCH /api/v1/sets/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful update", async () => {
    mockSetsRepo.update.mockResolvedValue(true);
    const res = await app.request(`/api/v1/sets/${setId1}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        printedTotal: 200,
        releasedAt: "2026-06-01",
        released: true,
        setType: "main",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockSetsRepo.update).toHaveBeenCalledWith(setId1, {
      name: "Updated Name",
      printedTotal: 200,
      releasedAt: "2026-06-01",
      released: true,
      setType: "main",
    });
  });

  it("returns 404 when set not found", async () => {
    mockSetsRepo.update.mockResolvedValue(null);
    const res = await app.request(`/api/v1/sets/${setId1}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated",
        printedTotal: 100,
        releasedAt: null,
        released: false,
        setType: "main",
      }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });

  it("accepts null releasedAt", async () => {
    mockSetsRepo.update.mockResolvedValue(true);
    const res = await app.request(`/api/v1/sets/${setId1}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        printedTotal: 50,
        releasedAt: null,
        released: false,
        setType: "supplemental",
      }),
    });
    expect(res.status).toBe(204);
    expect(mockSetsRepo.update).toHaveBeenCalledWith(setId1, {
      name: "Test",
      printedTotal: 50,
      releasedAt: null,
      released: false,
      setType: "supplemental",
    });
  });
});

describe("POST /api/v1/sets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 with created set id", async () => {
    mockSetsRepo.createIfNotExists.mockResolvedValue(setId1);
    const res = await app.request("/api/v1/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "new-set",
        name: "New Set",
        printedTotal: 50,
        releasedAt: "2026-03-01",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(setId1);
    expect(mockSetsRepo.createIfNotExists).toHaveBeenCalledWith({
      slug: "new-set",
      name: "New Set",
      printedTotal: 50,
      releasedAt: "2026-03-01",
    });
  });

  it("returns 409 when set already exists", async () => {
    mockSetsRepo.createIfNotExists.mockResolvedValue(null);
    const res = await app.request("/api/v1/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "existing-set",
        name: "Existing Set",
        printedTotal: 100,
        releasedAt: null,
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already exists");
  });

  it("creates set with optional releasedAt omitted", async () => {
    mockSetsRepo.createIfNotExists.mockResolvedValue(setId1);
    const res = await app.request("/api/v1/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "new-set",
        name: "New Set",
        printedTotal: 50,
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/v1/sets/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when set has no printings", async () => {
    mockSetsRepo.printingCount.mockResolvedValue(0);
    mockSetsRepo.deleteById.mockResolvedValue(undefined);
    const res = await app.request(`/api/v1/sets/${setId1}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockSetsRepo.deleteById).toHaveBeenCalledWith(setId1);
  });

  it("returns 409 when set still has printings", async () => {
    mockSetsRepo.printingCount.mockResolvedValue(5);
    const res = await app.request(`/api/v1/sets/${setId1}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("5 printing(s)");
  });
});

describe("PUT /api/v1/sets/reorder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful reorder", async () => {
    mockSetsRepo.listAll.mockResolvedValue([dbSet1, dbSet2]);
    mockSetsRepo.reorder.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/sets/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [setId2, setId1] }),
    });
    expect(res.status).toBe(204);
    expect(mockSetsRepo.reorder).toHaveBeenCalledWith([setId2, setId1]);
  });

  it("returns 400 when ids contain duplicates", async () => {
    const res = await app.request("/api/v1/sets/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [setId1, setId1] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Duplicate");
  });

  it("returns 400 when ids count does not match existing sets", async () => {
    mockSetsRepo.listAll.mockResolvedValue([dbSet1, dbSet2]);
    const res = await app.request("/api/v1/sets/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [setId1] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Expected 2");
  });

  it("returns 400 when ids contain unknown set IDs", async () => {
    const unknownId = "a0000000-0001-4000-a000-000000000099";
    mockSetsRepo.listAll.mockResolvedValue([dbSet1, dbSet2]);
    const res = await app.request("/api/v1/sets/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [setId1, unknownId] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown set IDs");
  });
});
