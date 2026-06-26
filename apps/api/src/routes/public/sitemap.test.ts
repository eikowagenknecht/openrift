import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { sitemapRouter } from "./sitemap";

const mockCatalogRepo = {
  allCardSitemapEntries: vi.fn(() => Promise.resolve([] as object[])),
  allSetSitemapEntries: vi.fn(() => Promise.resolve([] as object[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    catalog: mockCatalogRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, sitemapRouter);

describe("GET /api/v1/sitemap-data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with card and set sitemap entries", async () => {
    mockCatalogRepo.allCardSitemapEntries.mockResolvedValue([
      { slug: "jinx-rebel", updatedAt: "2026-04-01T12:00:00.000Z" },
    ]);
    mockCatalogRepo.allSetSitemapEntries.mockResolvedValue([
      { slug: "origins", updatedAt: "2026-03-01T12:00:00.000Z" },
    ]);

    const res = await app.request("/api/v1/sitemap-data");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards).toEqual([{ slug: "jinx-rebel", updatedAt: "2026-04-01T12:00:00.000Z" }]);
    expect(json.sets).toEqual([{ slug: "origins", updatedAt: "2026-03-01T12:00:00.000Z" }]);
    expect(mockCatalogRepo.allCardSitemapEntries).toHaveBeenCalledTimes(1);
    expect(mockCatalogRepo.allSetSitemapEntries).toHaveBeenCalledTimes(1);
  });

  it("returns empty arrays when there are no entries", async () => {
    mockCatalogRepo.allCardSitemapEntries.mockResolvedValue([]);
    mockCatalogRepo.allSetSitemapEntries.mockResolvedValue([]);

    const res = await app.request("/api/v1/sitemap-data");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cards).toEqual([]);
    expect(json.sets).toEqual([]);
  });
});
