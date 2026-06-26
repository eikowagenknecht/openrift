import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminFeatureFlagsRouter } from "./feature-flags";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockFlagsRepo = {
  listAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteByKey: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors are
// bridged to ORPCErrors inside the router, so 4xx responses carry `{ message }`.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { featureFlags: mockFlagsRepo } as never);
  await next();
});
registerRouterForTest(app, adminFeatureFlagsRouter);

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

describe("GET /feature-flags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized feature flags", async () => {
    mockFlagsRepo.listAll.mockResolvedValue([dbFlag1, dbFlag2]);
    const res = await app.request("/api/admin/v1/feature-flags");
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
    const res = await app.request("/api/admin/v1/feature-flags");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.flags).toEqual([]);
  });
});

describe("POST /feature-flags", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when flag is created", async () => {
    mockFlagsRepo.create.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/feature-flags", {
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
    const res = await app.request("/api/admin/v1/feature-flags", {
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
    const res = await app.request("/api/admin/v1/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "deck-builder" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toContain("already exists");
  });
});

describe("PATCH /feature-flags/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful update", async () => {
    mockFlagsRepo.update.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/feature-flags/deck-builder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(204);
    expect(mockFlagsRepo.update).toHaveBeenCalledWith("deck-builder", { enabled: true });
  });

  it("updates description only", async () => {
    mockFlagsRepo.update.mockResolvedValue(true);
    const res = await app.request("/api/admin/v1/feature-flags/deck-builder", {
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
    const res = await app.request("/api/admin/v1/feature-flags/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });
});

describe("DELETE /feature-flags/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockFlagsRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request("/api/admin/v1/feature-flags/deck-builder", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockFlagsRepo.deleteByKey).toHaveBeenCalledWith("deck-builder");
  });

  it("returns 404 when flag not found", async () => {
    mockFlagsRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request("/api/admin/v1/feature-flags/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });
});
