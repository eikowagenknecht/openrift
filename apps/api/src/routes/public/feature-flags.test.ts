import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { featureFlagsRoute } from "./feature-flags";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockFeatureFlagsRepo = {
  listKeyEnabled: vi.fn(() => Promise.resolve([] as { key: string; enabled: boolean }[])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db", {} as never);
    c.set("repos", { featureFlags: mockFeatureFlagsRepo } as never);
    await next();
  })
  .route("/api/v1", featureFlagsRoute);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/feature-flags", () => {
  beforeEach(() => {
    mockFeatureFlagsRepo.listKeyEnabled.mockReset();
  });

  it("returns 200 with key→enabled map", async () => {
    mockFeatureFlagsRepo.listKeyEnabled.mockResolvedValue([
      { key: "dark-mode", enabled: true },
      { key: "beta-search", enabled: false },
    ]);

    const res = await app.request("/api/v1/feature-flags");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ items: { "dark-mode": true, "beta-search": false } });
  });

  it("returns empty object when no flags exist", async () => {
    mockFeatureFlagsRepo.listKeyEnabled.mockResolvedValue([]);

    const res = await app.request("/api/v1/feature-flags");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ items: {} });
  });

  it("returns multiple flags correctly", async () => {
    mockFeatureFlagsRepo.listKeyEnabled.mockResolvedValue([
      { key: "a", enabled: true },
      { key: "b", enabled: true },
      { key: "c", enabled: false },
    ]);

    const res = await app.request("/api/v1/feature-flags");
    const json = await res.json();
    expect(Object.keys(json.items)).toHaveLength(3);
    expect(json.items.a).toBe(true);
    expect(json.items.c).toBe(false);
  });
});
