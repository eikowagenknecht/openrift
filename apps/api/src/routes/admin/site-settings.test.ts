import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { adminSiteSettingsRouter } from "./site-settings";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockRepo = {
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
  c.set("repos", { siteSettings: mockRepo } as never);
  await next();
});
registerRouterForTest(app, adminSiteSettingsRouter);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const now = new Date("2026-03-17T00:00:00Z");

const dbSetting1 = {
  key: "umami-url",
  value: "https://analytics.example.com",
  scope: "web",
  createdAt: now,
  updatedAt: now,
};

const dbSetting2 = {
  key: "rate-limit",
  value: "100",
  scope: "api",
  createdAt: now,
  updatedAt: now,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/admin/v1/site-settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with serialized site settings", async () => {
    mockRepo.listAll.mockResolvedValue([dbSetting1, dbSetting2]);
    const res = await app.request("/api/admin/v1/site-settings");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings).toHaveLength(2);
    expect(json.settings[0]).toEqual({
      key: "umami-url",
      value: "https://analytics.example.com",
      scope: "web",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(json.settings[1]).toEqual({
      key: "rate-limit",
      value: "100",
      scope: "api",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("returns empty array when no settings exist", async () => {
    mockRepo.listAll.mockResolvedValue([]);
    const res = await app.request("/api/admin/v1/site-settings");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.settings).toEqual([]);
  });
});

describe("POST /api/admin/v1/site-settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 201 when setting is created successfully", async () => {
    mockRepo.create.mockResolvedValue(dbSetting1);
    const res = await app.request("/api/admin/v1/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "umami-url", value: "https://analytics.example.com" }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith({
      key: "umami-url",
      value: "https://analytics.example.com",
      scope: "web",
    });
  });

  it("uses provided scope instead of default", async () => {
    mockRepo.create.mockResolvedValue(dbSetting2);
    const res = await app.request("/api/admin/v1/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "rate-limit", value: "100", scope: "api" }),
    });
    expect(res.status).toBe(201);
    expect(mockRepo.create).toHaveBeenCalledWith({
      key: "rate-limit",
      value: "100",
      scope: "api",
    });
  });

  it("returns 409 when key already exists", async () => {
    mockRepo.create.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/site-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "umami-url", value: "https://analytics.example.com" }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toContain("already exists");
  });
});

describe("PATCH /api/admin/v1/site-settings/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 when updating value", async () => {
    mockRepo.update.mockResolvedValue(dbSetting1);
    const res = await app.request("/api/admin/v1/site-settings/umami-url", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "https://new.example.com" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("umami-url", {
      value: "https://new.example.com",
    });
  });

  it("returns 204 when updating scope", async () => {
    mockRepo.update.mockResolvedValue(dbSetting1);
    const res = await app.request("/api/admin/v1/site-settings/umami-url", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "api" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("umami-url", { scope: "api" });
  });

  it("returns 204 when updating both value and scope", async () => {
    mockRepo.update.mockResolvedValue(dbSetting1);
    const res = await app.request("/api/admin/v1/site-settings/umami-url", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "new-val", scope: "api" }),
    });
    expect(res.status).toBe(204);
    expect(mockRepo.update).toHaveBeenCalledWith("umami-url", { value: "new-val", scope: "api" });
  });

  it("returns 404 when setting not found", async () => {
    mockRepo.update.mockResolvedValue(undefined);
    const res = await app.request("/api/admin/v1/site-settings/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "test" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });
});

describe("DELETE /api/admin/v1/site-settings/:key", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 204 on successful deletion", async () => {
    mockRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 1n });
    const res = await app.request("/api/admin/v1/site-settings/umami-url", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockRepo.deleteByKey).toHaveBeenCalledWith("umami-url");
  });

  it("returns 404 when setting not found", async () => {
    mockRepo.deleteByKey.mockResolvedValue({ numDeletedRows: 0n });
    const res = await app.request("/api/admin/v1/site-settings/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toContain("not found");
  });
});
