import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initRoute } from "./init";

const mockEnumsRepo = {
  all: vi.fn(() =>
    Promise.resolve({
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
    }),
  ),
};

const mockKeywordsRepo = {
  listAll: vi.fn(() => Promise.resolve([] as { name: string; color: string; darkText: boolean }[])),
  listAllTranslations: vi.fn(() =>
    Promise.resolve([] as { keywordName: string; language: string; label: string }[]),
  ),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      enums: mockEnumsRepo,
      keywords: mockKeywordsRepo,
    } as never);
    await next();
  })
  .route("/api/v1", initRoute);

describe("GET /api/v1/init", () => {
  beforeEach(() => {
    mockEnumsRepo.all.mockReset();
    mockKeywordsRepo.listAll.mockReset();
    mockKeywordsRepo.listAllTranslations.mockReset();
    mockEnumsRepo.all.mockResolvedValue({
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
    });
    mockKeywordsRepo.listAll.mockResolvedValue([]);
    mockKeywordsRepo.listAllTranslations.mockResolvedValue([]);
  });

  it("returns 200 with enums and keywords", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enums).toBeDefined();
    expect(json.keywords).toBeDefined();
  });

  it("returns enum data with isWellKnown stripped", async () => {
    mockEnumsRepo.all.mockResolvedValue({
      cardTypes: [{ slug: "creature", label: "Creature", sortOrder: 1, isWellKnown: true }],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
    });
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.enums.cardTypes).toEqual([{ slug: "creature", label: "Creature", sortOrder: 1 }]);
  });

  it("returns keywords as name-keyed map", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
      { name: "Burn", color: "#ff4400", darkText: true },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywords).toEqual({
      Shield: { color: "#4488ff", darkText: false },
      Burn: { color: "#ff4400", darkText: true },
    });
  });

  it("includes keyword translations when available", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
    ]);
    mockKeywordsRepo.listAllTranslations.mockResolvedValue([
      { keywordName: "Shield", language: "ZH", label: "护盾" },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywords.Shield.translations).toEqual({ ZH: "护盾" });
  });

  it("omits translations key when keyword has none", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywords.Shield.translations).toBeUndefined();
  });

  it("sets Cache-Control with public caching", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600",
    );
  });

  it("fetches all data in parallel", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.status).toBe(200);
    expect(mockEnumsRepo.all).toHaveBeenCalledTimes(1);
    expect(mockKeywordsRepo.listAll).toHaveBeenCalledTimes(1);
    expect(mockKeywordsRepo.listAllTranslations).toHaveBeenCalledTimes(1);
  });

  it("returns empty keywords when none exist", async () => {
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywords).toEqual({});
  });
});
