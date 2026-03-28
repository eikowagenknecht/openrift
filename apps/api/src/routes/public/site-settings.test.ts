import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { siteSettingsRoute } from "./site-settings";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockSiteSettingsRepo = {
  listByScope: vi.fn(() => Promise.resolve([] as { key: string; value: string }[])),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { siteSettings: mockSiteSettingsRepo } as never);
    await next();
  })
  .route("/api/v1", siteSettingsRoute);

// ---------------------------------------------------------------------------
// GET /api/v1/site-settings
// ---------------------------------------------------------------------------

describe("GET /api/v1/site-settings", () => {
  beforeEach(() => {
    mockSiteSettingsRepo.listByScope.mockReset();
  });

  it("returns 200 with items map", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([{ key: "theme", value: "dark" }]);
    const res = await app.request("/api/v1/site-settings");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toBeDefined();
  });

  it("maps rows to key-value pairs in items", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "dark" },
      { key: "banner", value: "Welcome to OpenRift!" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await res.json();
    expect(json.items).toEqual({
      theme: "dark",
      banner: "Welcome to OpenRift!",
    });
  });

  it("returns empty items when no settings exist", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([]);
    const res = await app.request("/api/v1/site-settings");
    const json = await res.json();
    expect(json.items).toEqual({});
  });

  it("calls listByScope with 'web' scope", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([]);
    await app.request("/api/v1/site-settings");
    expect(mockSiteSettingsRepo.listByScope).toHaveBeenCalledWith("web");
  });

  it("calls listByScope exactly once per request", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([]);
    await app.request("/api/v1/site-settings");
    expect(mockSiteSettingsRepo.listByScope).toHaveBeenCalledTimes(1);
  });

  it("sets Cache-Control with public caching", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([]);
    const res = await app.request("/api/v1/site-settings");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("handles multiple settings correctly", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "dark" },
      { key: "banner", value: "Hello" },
      { key: "maintenance", value: "false" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await res.json();
    expect(Object.keys(json.items)).toHaveLength(3);
    expect(json.items.maintenance).toBe("false");
  });

  it("overwrites duplicate keys with last value", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "light" },
      { key: "theme", value: "dark" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await res.json();
    expect(json.items.theme).toBe("dark");
  });
});
