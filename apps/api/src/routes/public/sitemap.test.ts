import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { sitemapRouter } from "./sitemap";

const mockCatalogRepo = {
  allCardSitemapEntries: vi.fn(() => Promise.resolve([] as object[])),
  allSetSitemapEntries: vi.fn(() => Promise.resolve([] as object[])),
};

const mockProductsRepo = {
  allSitemapEntries: vi.fn(() => Promise.resolve([] as object[])),
};

const mockMetaRepo = {
  sitemapEntries: vi.fn(() =>
    Promise.resolve({
      events: [] as object[],
      decks: [] as object[],
      legends: [] as object[],
      players: [] as object[],
    }),
  ),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    catalog: mockCatalogRepo,
    products: mockProductsRepo,
    meta: mockMetaRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, sitemapRouter);

describe("GET /api/v1/sitemap-data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with card, set, and product sitemap entries, keying legends by champion-led name", async () => {
    mockCatalogRepo.allCardSitemapEntries.mockResolvedValue([
      { slug: "jinx-rebel", updatedAt: "2026-04-01T12:00:00.000Z" },
    ]);
    mockCatalogRepo.allSetSitemapEntries.mockResolvedValue([
      { slug: "origins", updatedAt: "2026-03-01T12:00:00.000Z" },
    ]);
    mockProductsRepo.allSitemapEntries.mockResolvedValue([
      { slug: "origins-proving-grounds", updatedAt: "2026-02-01T12:00:00.000Z" },
    ]);
    mockMetaRepo.sitemapEntries.mockResolvedValue({
      events: [{ slug: "summoner-skirmish-berlin", updatedAt: "2026-01-01T12:00:00.000Z" }],
      decks: [{ slug: "aB3dE5gH7jK9", updatedAt: "2026-01-02T12:00:00.000Z" }],
      legends: [
        {
          cardId: "f0000000-0001-4000-a000-000000000001",
          name: "Heart of the Tempest",
          slug: "heart-of-the-tempest",
          types: ["legend"],
          tags: ["Kennen"],
          domains: ["fury"],
          updatedAt: new Date("2026-01-03T12:00:00.000Z"),
        },
      ],
      players: [{ slug: "u347713", updatedAt: "2026-01-04T12:00:00.000Z" }],
    });

    const res = await app.request("/api/v1/sitemap-data");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.cards).toEqual([{ slug: "jinx-rebel", updatedAt: "2026-04-01T12:00:00.000Z" }]);
    expect(json.sets).toEqual([{ slug: "origins", updatedAt: "2026-03-01T12:00:00.000Z" }]);
    expect(json.products).toEqual([
      { slug: "origins-proving-grounds", updatedAt: "2026-02-01T12:00:00.000Z" },
    ]);
    expect(json.metaEvents).toEqual([
      { slug: "summoner-skirmish-berlin", updatedAt: "2026-01-01T12:00:00.000Z" },
    ]);
    expect(json.metaDecks).toEqual([
      { slug: "aB3dE5gH7jK9", updatedAt: "2026-01-02T12:00:00.000Z" },
    ]);
    expect(json.metaLegends).toEqual([
      { slug: "kennen-heart-of-the-tempest", updatedAt: "2026-01-03T12:00:00.000Z" },
    ]);
    expect(json.metaPlayers).toEqual([{ slug: "u347713", updatedAt: "2026-01-04T12:00:00.000Z" }]);
    expect(mockCatalogRepo.allCardSitemapEntries).toHaveBeenCalledTimes(1);
    expect(mockCatalogRepo.allSetSitemapEntries).toHaveBeenCalledTimes(1);
    expect(mockProductsRepo.allSitemapEntries).toHaveBeenCalledTimes(1);
  });

  it("returns empty arrays when there are no entries", async () => {
    mockCatalogRepo.allCardSitemapEntries.mockResolvedValue([]);
    mockCatalogRepo.allSetSitemapEntries.mockResolvedValue([]);
    mockProductsRepo.allSitemapEntries.mockResolvedValue([]);
    mockMetaRepo.sitemapEntries.mockResolvedValue({
      events: [],
      decks: [],
      legends: [],
      players: [],
    });

    const res = await app.request("/api/v1/sitemap-data");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.cards).toEqual([]);
    expect(json.sets).toEqual([]);
    expect(json.products).toEqual([]);
    expect(json.metaEvents).toEqual([]);
    expect(json.metaDecks).toEqual([]);
    expect(json.metaLegends).toEqual([]);
    expect(json.metaPlayers).toEqual([]);
  });
});
