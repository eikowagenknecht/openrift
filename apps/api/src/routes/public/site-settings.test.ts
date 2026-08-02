import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { siteSettingsRouter } from "./site-settings";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockSiteSettingsRepo = {
  listByScope: vi.fn(() => Promise.resolve([] as { key: string; value: string }[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  c.set("repos", { siteSettings: mockSiteSettingsRepo } as any);
  await next();
});
registerRouterForTest(app, siteSettingsRouter);

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
    const json = await readJson(res);
    expect(json.settings).toBeDefined();
  });

  it("maps rows to key-value pairs in items", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "dark" },
      { key: "banner", value: "Welcome to OpenRift!" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await readJson(res);
    expect(json.settings).toEqual({
      theme: "dark",
      banner: "Welcome to OpenRift!",
    });
  });

  it("returns empty items when no settings exist", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([]);
    const res = await app.request("/api/v1/site-settings");
    const json = await readJson(res);
    expect(json.settings).toEqual({});
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

  it("handles multiple settings correctly", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "dark" },
      { key: "banner", value: "Hello" },
      { key: "maintenance", value: "false" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await readJson(res);
    expect(Object.keys(json.settings)).toHaveLength(3);
    expect(json.settings.maintenance).toBe("false");
  });

  it("overwrites duplicate keys with last value", async () => {
    mockSiteSettingsRepo.listByScope.mockResolvedValue([
      { key: "theme", value: "light" },
      { key: "theme", value: "dark" },
    ]);
    const res = await app.request("/api/v1/site-settings");
    const json = await readJson(res);
    expect(json.settings.theme).toBe("dark");
  });
});
