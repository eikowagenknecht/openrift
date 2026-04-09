import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initRoute } from "./init";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

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

const mockKeywordStylesRepo = {
  listAll: vi.fn(() => Promise.resolve([] as { name: string; color: string; darkText: boolean }[])),
  listAllTranslations: vi.fn(() =>
    Promise.resolve([] as { keywordName: string; language: string; label: string }[]),
  ),
};

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      enums: mockEnumsRepo,
      keywordStyles: mockKeywordStylesRepo,
    } as never);
    await next();
  })
  .route("/api/v1", initRoute);

// ---------------------------------------------------------------------------
// GET /api/v1/init
// ---------------------------------------------------------------------------

describe("GET /api/v1/init", () => {
  beforeEach(() => {
    mockEnumsRepo.all.mockReset();
    mockKeywordStylesRepo.listAll.mockReset();
    mockKeywordStylesRepo.listAllTranslations.mockReset();
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
    mockKeywordStylesRepo.listAll.mockResolvedValue([]);
    mockKeywordStylesRepo.listAllTranslations.mockResolvedValue([]);
  });

  it("returns 200 with enums and keywordStyles", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.enums).toBeDefined();
    expect(json.keywordStyles).toBeDefined();
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

  it("returns keyword styles as name-keyed map", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
      { name: "Burn", color: "#ff4400", darkText: true },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywordStyles).toEqual({
      Shield: { color: "#4488ff", darkText: false },
      Burn: { color: "#ff4400", darkText: true },
    });
  });

  it("includes keyword translations when available", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
    ]);
    mockKeywordStylesRepo.listAllTranslations.mockResolvedValue([
      { keywordName: "Shield", language: "ZH", label: "护盾" },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywordStyles.Shield.translations).toEqual({ ZH: "护盾" });
  });

  it("omits translations key when keyword has none", async () => {
    mockKeywordStylesRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywordStyles.Shield.translations).toBeUndefined();
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
    expect(mockKeywordStylesRepo.listAll).toHaveBeenCalledTimes(1);
    expect(mockKeywordStylesRepo.listAllTranslations).toHaveBeenCalledTimes(1);
  });

  it("returns empty keywordStyles when no styles exist", async () => {
    const res = await app.request("/api/v1/init");
    const json = await res.json();
    expect(json.keywordStyles).toEqual({});
  });
});
