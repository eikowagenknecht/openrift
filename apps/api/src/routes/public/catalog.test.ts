import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { catalogRouter } from "./catalog";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCatalogRepo = {
  sets: vi.fn(() => Promise.resolve([] as unknown[])),
  cards: vi.fn(() => Promise.resolve([] as unknown[])),
  printings: vi.fn(() => Promise.resolve([] as unknown[])),
  printingImages: vi.fn(() => Promise.resolve([] as unknown[])),
  cardBans: vi.fn(() => Promise.resolve([])),
  cardErrata: vi.fn(() => Promise.resolve([])),
  totalCopies: vi.fn(() => Promise.resolve(0)),
  markersList: vi.fn(() => Promise.resolve([])),
};

const mockDistributionChannelsRepo = {
  listForPrintingIds: vi.fn(() => Promise.resolve([])),
  listAll: vi.fn(() => Promise.resolve([])),
};

const mockCustomTagsRepo = {
  assignmentsByCard: vi.fn(() => Promise.resolve(new Map<string, string[]>())),
};

// Mount the catalog router the way production does (one OpenAPIHandler behind a
// catch-all). Cache-Control + `etag()` are app-level concerns (orpc/cache-policy.ts
// and its test), so they are not asserted here.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    catalog: mockCatalogRepo,
    distributionChannels: mockDistributionChannelsRepo,
    customTags: mockCustomTagsRepo,
  } as never);
  await next();
});
registerRouterForTest(app, catalogRouter);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

// `releases` (the per-language release periods) and `setType` are part of the
// catalog output schema, so the fixture carries them too.
const dbSet = {
  id: "OGS",
  slug: "OGS",
  name: "Original Set",
  releases: { EN: { releasedAt: "2025-10-31", precision: "day" as const } },
  setType: "main" as const,
};

const dbCard = {
  id: "OGS-001",
  slug: "OGS-001",
  name: "Fire Dragon",
  type: "unit",
  types: ["unit"],
  superTypes: ["Elite"],
  domains: ["fury"],
  tokenCardIds: [],
  might: 4,
  energy: 5,
  power: 6,
  mightBonus: 1,
  maxCopiesOverride: null,
  keywords: ["Shield"],
  tags: ["Dragon"],
};

const dbPrintingRow = {
  id: "OGS-001:rare:normal:",
  slug: "OGS-001:rare:normal:",
  cardId: "OGS-001",
  setId: "OGS",
  shortCode: "OGS-001",
  rarity: "rare",
  artVariant: "normal",
  isSigned: false,
  markerSlugs: [],
  finish: "normal",
  size: "standard",
  artist: "Alice",
  publicCode: "ABCD",
  printedRulesText: "A fiery beast",
  printedEffectText: "Deal 3 damage",
  flavorText: null,
  printedName: null,
  printedYear: null,
  language: "EN",
  // `comment` + `canonicalRank` ride through from the `printings_ordered` view;
  // the catalog output schema requires both.
  comment: null,
  canonicalRank: 1,
};

const dbImage = {
  printingId: "OGS-001:rare:normal:",
  face: "front",
  imageId: "019d6c25-b081-74b3-a901-64da4ae012ab",
};

function seedDefaults(overrides?: {
  sets?: unknown[];
  cards?: unknown[];
  printings?: unknown[];
  printingImages?: unknown[];
  totalCopies?: number;
}) {
  mockCatalogRepo.sets.mockResolvedValue(overrides?.sets ?? [dbSet]);
  mockCatalogRepo.cards.mockResolvedValue(overrides?.cards ?? [dbCard]);
  mockCatalogRepo.printings.mockResolvedValue(overrides?.printings ?? [dbPrintingRow]);
  mockCatalogRepo.printingImages.mockResolvedValue(overrides?.printingImages ?? [dbImage]);
  mockCatalogRepo.cardBans.mockResolvedValue([]);
  mockCatalogRepo.cardErrata.mockResolvedValue([]);
  mockCatalogRepo.totalCopies.mockResolvedValue(overrides?.totalCopies ?? 42);
  mockCatalogRepo.markersList.mockResolvedValue([]);
  mockDistributionChannelsRepo.listForPrintingIds.mockResolvedValue([]);
  mockCustomTagsRepo.assignmentsByCard.mockResolvedValue(new Map());
}

// ---------------------------------------------------------------------------
// GET /api/v1/catalog
// ---------------------------------------------------------------------------

describe("GET /api/v1/catalog", () => {
  beforeEach(() => {
    mockCatalogRepo.sets.mockReset();
    mockCatalogRepo.cards.mockReset();
    mockCatalogRepo.printings.mockReset();
    mockCatalogRepo.printingImages.mockReset();
    mockCatalogRepo.cardBans.mockReset();
    mockCatalogRepo.cardErrata.mockReset();
    mockCatalogRepo.totalCopies.mockReset();
    seedDefaults();
  });

  it("returns 200 with normalized CatalogResponse structure", async () => {
    const res = await app.request("/api/v1/catalog");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.sets).toHaveLength(1);
    expect(Object.keys(json.printings)).toHaveLength(1);
    expect(Object.keys(json.cards)).toHaveLength(1);
  });

  it("returns sets as { id, slug, name } objects", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    expect(json.sets[0]).toEqual({
      id: "OGS",
      slug: "OGS",
      name: "Original Set",
      releases: { EN: { releasedAt: "2025-10-31", precision: "day" } },
      setType: "main",
    });
  });

  it("returns cards keyed by card ID with non-null fields preserved", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const card = json.cards["OGS-001"];
    expect(card).toBeDefined();
    expect(card.id).toBeUndefined();
    expect(card.name).toBe("Fire Dragon");
    expect(card.superTypes).toEqual(["Elite"]);
    expect(card.mightBonus).toBe(1);
    expect(card.might).toBe(4);
    expect(card.energy).toBe(5);
    expect(card.power).toBe(6);
  });

  it("preserves null fields and empty arrays on cards", async () => {
    seedDefaults({
      cards: [
        {
          ...dbCard,
          might: null,
          energy: null,
          power: null,
          mightBonus: null,
          maxCopiesOverride: null,
          superTypes: [],
          keywords: [],
          tags: [],
        },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const card = json.cards["OGS-001"];
    expect(card.might).toBeNull();
    expect(card.energy).toBeNull();
    expect(card.power).toBeNull();
    expect(card.mightBonus).toBeNull();
    expect(card.errata).toBeNull();
    expect(card.superTypes).toEqual([]);
    expect(card.keywords).toEqual([]);
    expect(card.tags).toEqual([]);
    expect(card.name).toBe("Fire Dragon");
    expect(card.domains).toEqual(["fury"]);
  });

  it("preserves null fields and empty arrays on printings", async () => {
    seedDefaults({
      printings: [{ ...dbPrintingRow, printedRulesText: null, printedEffectText: null }],
      printingImages: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.printedRulesText).toBeNull();
    expect(printing.printedEffectText).toBeNull();
    expect(printing.flavorText).toBeNull();
    expect(printing.images).toEqual([]);
    expect(printing.artist).toBe("Alice");
  });

  it("maps printing fields with cardId reference instead of nested card", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const printingId = "OGS-001:rare:normal:";
    const printing = json.printings[printingId];

    expect(printing).toBeDefined();
    expect(printing.id).toBeUndefined();
    expect(printing.shortCode).toBe("OGS-001");
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.markers).toEqual([]);
    expect(printing.distributionChannels).toEqual([]);
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");
    expect(printing.cardId).toBe("OGS-001");
    expect(printing.card).toBeUndefined();
  });

  it("forwards the image_files.id as imageId on each printing image", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    expect(json.printings["OGS-001:rare:normal:"].images).toEqual([
      { face: "front", imageId: "019d6c25-b081-74b3-a901-64da4ae012ab" },
    ]);
  });

  it("passes setId through on printing", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    expect(json.printings["OGS-001:rare:normal:"].setId).toBe("OGS");
  });

  it("returns errata as null when no errata exists", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const card = json.cards["OGS-001"];
    expect(card.errata).toBeNull();
  });

  it("does not include market price on printing (prices live on /api/v1/prices)", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing).toBeDefined();
    expect("marketPrice" in printing).toBe(false);
    expect("marketPrices" in printing).toBe(false);
  });

  it("returns printings from multiple sets keyed by printing id", async () => {
    const secondSet = {
      id: "S2",
      slug: "S2",
      name: "Set Two",
      releases: {},
      setType: "supplemental" as const,
    };
    const secondCard = { ...dbCard, id: "S2-001", slug: "S2-001" };
    const secondRow = {
      ...dbPrintingRow,
      id: "S2-001:rare:normal",
      slug: "S2-001:rare:normal",
      cardId: "S2-001",
      shortCode: "S2-001",
      setId: "S2",
    };
    seedDefaults({
      sets: [dbSet, secondSet],
      cards: [dbCard, secondCard],
      printings: [dbPrintingRow, secondRow],
      printingImages: [],
    });

    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    expect(json.sets).toHaveLength(2);
    expect(Object.keys(json.printings)).toHaveLength(2);
    expect(json.printings["OGS-001:rare:normal:"]).toBeDefined();
    expect(json.printings["S2-001:rare:normal"]).toBeDefined();
    expect(Object.keys(json.cards)).toHaveLength(2);
  });

  it("returns empty printings when catalog is empty", async () => {
    seedDefaults({
      sets: [],
      cards: [],
      printings: [],
      printingImages: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    expect(json.printings).toEqual({});
    expect(json.cards).toEqual({});
    expect(json.sets).toEqual([]);
  });

  it("accepts and ignores the ?v= cache-busting param (same body and ETag)", async () => {
    const plain = await app.request("/api/v1/catalog");
    const versioned = await app.request("/api/v1/catalog?v=some-etag-token");
    expect(versioned.status).toBe(200);
    expect(await readJson(versioned)).toEqual(await readJson(plain));
  });

  it("returns multiple images for a single printing", async () => {
    seedDefaults({
      printingImages: [
        { printingId: "OGS-001:rare:normal:", face: "front", imageId: "front-uuid" },
        { printingId: "OGS-001:rare:normal:", face: "back", imageId: "back-uuid" },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.images).toHaveLength(2);
    expect(printing.images[0]).toEqual({ face: "front", imageId: "front-uuid" });
    expect(printing.images[1]).toEqual({ face: "back", imageId: "back-uuid" });
  });

  it("handles printing with no images", async () => {
    seedDefaults({
      printingImages: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await readJson(res);
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.images).toEqual([]);
  });
});
