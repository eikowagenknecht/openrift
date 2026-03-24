import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { acquisitionSourcesRoute } from "./acquisition-sources";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
  listForUser: vi.fn(() => Promise.resolve([] as object[])),
  create: vi.fn(() => Promise.resolve({} as object)),
  getByIdForUser: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  update: vi.fn(() => Promise.resolve(undefined as object | undefined)),
  deleteByIdForUser: vi.fn(() => Promise.resolve({ numDeletedRows: 0n })),
};

// ---------------------------------------------------------------------------
// Test app — includes error handler so we can assert status codes from AppError
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db", {} as never);
    c.set("user", { id: USER_ID });
    c.set("repos", { acquisitionSources: mockRepo } as never);
    await next();
  })
  .route("/api/v1", acquisitionSourcesRoute)
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

const dbSource = {
  id: "a0000000-0001-4000-a000-000000000010",
  userId: USER_ID,
  name: "TCGplayer",
  description: "Online marketplace",
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/acquisition-sources", () => {
  beforeEach(() => {
    mockRepo.listForUser.mockReset();
  });

  it("returns 200 with list of sources", async () => {
    mockRepo.listForUser.mockResolvedValue([dbSource]);
    const res = await app.request("/api/v1/acquisition-sources");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("TCGplayer");
    expect(json.items[0].createdAt).toBe(now.toISOString());
  });

  it("returns empty array when no sources", async () => {
    mockRepo.listForUser.mockResolvedValue([]);
    const res = await app.request("/api/v1/acquisition-sources");
    const json = await res.json();
    expect(json.items).toEqual([]);
  });
});

describe("POST /api/v1/acquisition-sources", () => {
  beforeEach(() => {
    mockRepo.create.mockReset();
  });

  it("returns 201 with created source", async () => {
    mockRepo.create.mockResolvedValue(dbSource);
    const res = await app.request("/api/v1/acquisition-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "TCGplayer", description: "Online marketplace" }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("TCGplayer");
  });

  it("creates source with null description when omitted", async () => {
    mockRepo.create.mockResolvedValue({ ...dbSource, description: null });
    const res = await app.request("/api/v1/acquisition-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "LGS" }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/acquisition-sources/:id", () => {
  beforeEach(() => {
    mockRepo.getByIdForUser.mockReset();
  });

  it("returns 200 with source when found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue(dbSource);
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe(dbSource.id);
  });

  it("returns 404 when source not found", async () => {
    mockRepo.getByIdForUser.mockResolvedValue();
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/acquisition-sources/:id", () => {
  beforeEach(() => {
    mockRepo.update.mockReset();
  });

  it("returns 200 with updated source", async () => {
    const updated = { ...dbSource, name: "Updated" };
    mockRepo.update.mockResolvedValue(updated);
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Updated");
  });

  it("returns 404 when source not found", async () => {
    mockRepo.update.mockResolvedValue();
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/acquisition-sources/:id", () => {
  beforeEach(() => {
    mockRepo.deleteByIdForUser.mockReset();
  });

  it("returns 204 when deleted", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("returns 404 when source not found", async () => {
    mockRepo.deleteByIdForUser.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request(`/api/v1/acquisition-sources/${dbSource.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
