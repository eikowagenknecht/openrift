import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { adminFeatureFlagsRoute } from "./feature-flags";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockFlagsRepo = {
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByKey: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("repos", { featureFlags: mockFlagsRepo } as never);
    await next();
  })
  .route("/api/v1", adminFeatureFlagsRoute)
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

const dbFlag1 = {
  key: "deck-builder",
  enabled: true,
  description: "Enable the deck builder",
  createdAt: now,
  updatedAt: now,
};

const dbFlag2 = {
  key: "trade-system",
  enabled: false,
  description: null,
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/feature-flags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized feature flags", async () => {
    mockFlagsRepo.listAll.mockResolvedValue([dbFlag1, dbFlag2]);
    const res = await app.request("/api/v1/feature-flags");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.flags).toHaveLength(2);
    expect(json.flags[0]).toEqual({
      key: "deck-builder",
      enabled: true,
      description: "Enable the deck builder",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(json.flags[1]).toEqual({
      key: "trade-system",
      enabled: false,
      description: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("returns empty array when no flags exist", async () => {
    mockFlagsRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/v1/feature-flags");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.flags).toEqual([]);
  });
});

describe("POST /api/v1/feature-flags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when flag is created", async () => {
    mockFlagsRepo.create.mockResolvedValue(true);
    const res = await app.request("/api/v1/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "deck-builder" }),
    });
    expect(res.status).toBe(201);
    expect(mockFlagsRepo.create).toHaveBeenCalledWith({
      key: "deck-builder",
      enabled: false,
      description: null,
    });
  });

  it("passes explicit enabled and description values", async () => {
    mockFlagsRepo.create.mockResolvedValue(true);
    const res = await app.request("/api/v1/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "deck-builder",
        enabled: true,
        description: "Enable deck builder feature",
      }),
    });
    expect(res.status).toBe(201);
    expect(mockFlagsRepo.create).toHaveBeenCalledWith({
      key: "deck-builder",
      enabled: true,
      description: "Enable deck builder feature",
    });
  });

  it("returns 409 when flag already exists", async () => {
    mockFlagsRepo.create.mockResolvedValue(false);
    const res = await app.request("/api/v1/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "deck-builder" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("already exists");
  });
});

describe("PATCH /api/v1/feature-flags/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful update", async () => {
    mockFlagsRepo.update.mockResolvedValue(true);
    const res = await app.request("/api/v1/feature-flags/deck-builder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(204);
    expect(mockFlagsRepo.update).toHaveBeenCalledWith("deck-builder", { enabled: true });
  });

  it("updates description only", async () => {
    mockFlagsRepo.update.mockResolvedValue(true);
    const res = await app.request("/api/v1/feature-flags/deck-builder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated description" }),
    });
    expect(res.status).toBe(204);
    expect(mockFlagsRepo.update).toHaveBeenCalledWith("deck-builder", {
      description: "Updated description",
    });
  });

  it("returns 404 when flag not found", async () => {
    mockFlagsRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/feature-flags/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });
});

describe("DELETE /api/v1/feature-flags/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockFlagsRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request("/api/v1/feature-flags/deck-builder", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockFlagsRepo.deleteByKey).toHaveBeenCalledWith("deck-builder");
  });

  it("returns 404 when flag not found", async () => {
    mockFlagsRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request("/api/v1/feature-flags/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("not found");
  });
});
