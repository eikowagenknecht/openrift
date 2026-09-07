import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { initRouter } from "./init";

// Must include every enum key the response schema declares; oRPC validates
// the handler output, so an incomplete fixture 500s.
interface EnumRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

const emptyEnums: Record<string, EnumRow[]> = {
  cardTypes: [],
  rarities: [],
  domains: [],
  superTypes: [],
  finishes: [],
  artVariants: [],
  cardSizes: [],
  deckFormats: [],
  deckZones: [],
  conditions: [],
  graders: [],
  languages: [],
  markers: [],
};

const mockEnumsRepo = {
  all: vi.fn(() => Promise.resolve(emptyEnums)),
};

const mockKeywordsRepo = {
  listAll: vi.fn(() =>
    Promise.resolve(
      [] as { name: string; color: string; darkText: boolean; costKeyword: boolean }[],
    ),
  ),
  listAllTranslations: vi.fn(() =>
    Promise.resolve([] as { keywordName: string; language: string; label: string }[]),
  ),
};

const mockDistributionChannelsRepo = {
  listAll: vi.fn(() => Promise.resolve([] as never[])),
};

const mockPrintingCitationsRepo = {
  listForPrintingIds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const mockCustomTagsRepo = {
  listAll: vi.fn(() => Promise.resolve([] as never[])),
};

const mockCatalogRepo = {
  championIdentifierTags: vi.fn(() => Promise.resolve([] as string[])),
};

const mockTagCategoriesRepo = {
  listAll: vi.fn(() => Promise.resolve([] as { slug: string; label: string; sortOrder: number }[])),
};

const mockTagDefinitionsRepo = {
  listAll: vi.fn(() => Promise.resolve([] as { tag: string; category: string }[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    enums: mockEnumsRepo,
    keywords: mockKeywordsRepo,
    distributionChannels: mockDistributionChannelsRepo,
    printingCitations: mockPrintingCitationsRepo,
    customTags: mockCustomTagsRepo,
    catalog: mockCatalogRepo,
    tagCategories: mockTagCategoriesRepo,
    tagDefinitions: mockTagDefinitionsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, initRouter);

describe("GET /api/v1/init", () => {
  beforeEach(() => {
    mockEnumsRepo.all.mockReset();
    mockKeywordsRepo.listAll.mockReset();
    mockKeywordsRepo.listAllTranslations.mockReset();
    mockDistributionChannelsRepo.listAll.mockReset();
    mockCustomTagsRepo.listAll.mockReset();
    mockCatalogRepo.championIdentifierTags.mockReset();
    mockEnumsRepo.all.mockResolvedValue(emptyEnums);
    mockKeywordsRepo.listAll.mockResolvedValue([]);
    mockKeywordsRepo.listAllTranslations.mockResolvedValue([]);
    mockDistributionChannelsRepo.listAll.mockResolvedValue([]);
    mockCustomTagsRepo.listAll.mockResolvedValue([]);
    mockCatalogRepo.championIdentifierTags.mockResolvedValue([]);
    mockTagCategoriesRepo.listAll.mockReset();
    mockTagDefinitionsRepo.listAll.mockReset();
    mockTagCategoriesRepo.listAll.mockResolvedValue([]);
    mockTagDefinitionsRepo.listAll.mockResolvedValue([]);
  });

  it("returns 200 with enums and keywords", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.enums).toBeDefined();
    expect(json.keywords).toBeDefined();
  });

  it("returns enum data with isWellKnown stripped", async () => {
    mockEnumsRepo.all.mockResolvedValue({
      ...emptyEnums,
      cardTypes: [{ slug: "creature", label: "Creature", sortOrder: 1, isWellKnown: true }],
    });
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.enums.cardTypes).toEqual([{ slug: "creature", label: "Creature", sortOrder: 1 }]);
  });

  it("returns keywords as name-keyed map", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false, costKeyword: false },
      { name: "Burn", color: "#ff4400", darkText: true, costKeyword: true },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.keywords).toEqual({
      Shield: { color: "#4488ff", darkText: false, costKeyword: false },
      Burn: { color: "#ff4400", darkText: true, costKeyword: true },
    });
  });

  it("includes keyword translations when available", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false, costKeyword: false },
    ]);
    mockKeywordsRepo.listAllTranslations.mockResolvedValue([
      { keywordName: "Shield", language: "SC", label: "护盾" },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.keywords.Shield.translations).toEqual({ SC: "护盾" });
  });

  it("omits translations key when keyword has none", async () => {
    mockKeywordsRepo.listAll.mockResolvedValue([
      { name: "Shield", color: "#4488ff", darkText: false, costKeyword: false },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.keywords.Shield.translations).toBeUndefined();
  });

  it("fetches all data in parallel", async () => {
    const res = await app.request("/api/v1/init");
    expect(res.status).toBe(200);
    expect(mockEnumsRepo.all).toHaveBeenCalledTimes(1);
    expect(mockKeywordsRepo.listAll).toHaveBeenCalledTimes(1);
    expect(mockKeywordsRepo.listAllTranslations).toHaveBeenCalledTimes(1);
    expect(mockCatalogRepo.championIdentifierTags).toHaveBeenCalledTimes(1);
  });

  it("returns championIdentifierTags from the catalog repo", async () => {
    mockCatalogRepo.championIdentifierTags.mockResolvedValue(["Ivern", "Karma"]);
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.championIdentifierTags).toEqual(["Ivern", "Karma"]);
  });

  it("returns empty keywords when none exist", async () => {
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.keywords).toEqual({});
  });

  it("returns tag categories and the tag → category map", async () => {
    mockTagCategoriesRepo.listAll.mockResolvedValue([
      { slug: "region", label: "Region", sortOrder: 0 },
      { slug: "species", label: "Species", sortOrder: 2 },
    ]);
    mockTagDefinitionsRepo.listAll.mockResolvedValue([
      { tag: "Ionia", category: "region" },
      { tag: "Poro", category: "species" },
    ]);
    const res = await app.request("/api/v1/init");
    const json = await readJson(res);
    expect(json.tagCategories).toEqual([
      { slug: "region", label: "Region", sortOrder: 0 },
      { slug: "species", label: "Species", sortOrder: 2 },
    ]);
    expect(json.tagCategoryMap).toEqual({ Ionia: "region", Poro: "species" });
  });
});
