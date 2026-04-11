import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { catalogRoute } from "./catalog";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCatalogRepo = {
  sets: vi.fn(() => Promise.resolve([])),
  cards: vi.fn(() => Promise.resolve([])),
  printings: vi.fn(() => Promise.resolve([])),
  printingImages: vi.fn(() => Promise.resolve([])),
  cardBans: vi.fn(() => Promise.resolve([])),
  cardErrata: vi.fn(() => Promise.resolve([])),
  totalCopies: vi.fn(() => Promise.resolve(0)),
};

// oxlint-disable-next-line -- test mock doesn't match full Repos type
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      catalog: mockCatalogRepo,
    } as never);
    await next();
  })
  .route("/api/v1", catalogRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbSet = { id: "OGS", slug: "OGS", name: "Original Set" };

const dbCard = {
  id: "OGS-001",
  slug: "OGS-001",
  name: "Fire Dragon",
  type: "Unit",
  superTypes: ["Elite"],
  domains: ["Fury"],
  might: 4,
  energy: 5,
  power: 6,
  mightBonus: 1,
  keywords: ["Shield"],
  tags: ["Dragon"],
};

const dbPrintingRow = {
  id: "OGS-001:rare:normal:",
  slug: "OGS-001:rare:normal:",
  cardId: "OGS-001",
  setId: "OGS",
  shortCode: "OGS-001",
  rarity: "Rare",
  artVariant: "normal",
  isSigned: false,
  promoType: null,
  finish: "normal",
  artist: "Alice",
  publicCode: "ABCD",
  printedRulesText: "A fiery beast",
  printedEffectText: "Deal 3 damage",
  flavorText: null,
  printedName: null,
  language: "EN",
};

const dbImage = {
  printingId: "OGS-001:rare:normal:",
  face: "front",
  url: "https://example.com/thumb.jpg",
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
    const json = await res.json();
    expect(json.sets).toHaveLength(1);
    expect(Object.keys(json.printings)).toHaveLength(1);
    expect(Object.keys(json.cards)).toHaveLength(1);
  });

  it("returns sets as { id, slug, name } objects", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.sets[0]).toEqual({ id: "OGS", slug: "OGS", name: "Original Set" });
  });

  it("returns cards keyed by card ID with non-null fields preserved", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
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
          superTypes: [],
          keywords: [],
          tags: [],
        },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
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
    expect(card.domains).toEqual(["Fury"]);
  });

  it("preserves null fields and empty arrays on printings", async () => {
    seedDefaults({
      printings: [{ ...dbPrintingRow, printedRulesText: null, printedEffectText: null }],
      printingImages: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.printedRulesText).toBeNull();
    expect(printing.printedEffectText).toBeNull();
    expect(printing.flavorText).toBeNull();
    expect(printing.images).toEqual([]);
    expect(printing.artist).toBe("Alice");
  });

  it("maps printing fields with cardId reference instead of nested card", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printingId = "OGS-001:rare:normal:";
    const printing = json.printings[printingId];

    expect(printing).toBeDefined();
    expect(printing.id).toBeUndefined();
    expect(printing.shortCode).toBe("OGS-001");
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.promoType).toBeNull();
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");
    expect(printing.cardId).toBe("OGS-001");
    expect(printing.card).toBeUndefined();
  });

  it("expands stored base URL into full + thumbnail variants", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings["OGS-001:rare:normal:"].images).toEqual([
      {
        face: "front",
        full: "https://example.com/thumb.jpg-full.webp",
        thumbnail: "https://example.com/thumb.jpg-400w.webp",
      },
    ]);
  });

  it("passes setId through on printing", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings["OGS-001:rare:normal:"].setId).toBe("OGS");
  });

  it("returns errata as null when no errata exists", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card.errata).toBeNull();
  });

  it("does not include market price on printing (prices live on /api/v1/prices)", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing).toBeDefined();
    expect("marketPrice" in printing).toBe(false);
    expect("marketPrices" in printing).toBe(false);
  });

  it("returns printings from multiple sets keyed by printing id", async () => {
    const secondSet = { id: "S2", slug: "S2", name: "Set Two" };
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
    const json = await res.json();
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
    const json = await res.json();
    expect(json.printings).toEqual({});
    expect(json.cards).toEqual({});
    expect(json.sets).toEqual([]);
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/v1/catalog");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const first = await app.request("/api/v1/catalog");
    const etag = first.headers.get("ETag") ?? "";

    const res = await app.request("/api/v1/catalog", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.request("/api/v1/catalog", {
      headers: { "If-None-Match": '"stale"' },
    });
    expect(res.status).toBe(200);
  });

  it("returns multiple images for a single printing", async () => {
    seedDefaults({
      printingImages: [
        { printingId: "OGS-001:rare:normal:", face: "front", url: "https://example.com/front.jpg" },
        { printingId: "OGS-001:rare:normal:", face: "back", url: "https://example.com/back.jpg" },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.images).toHaveLength(2);
    expect(printing.images[0]).toEqual({
      face: "front",
      full: "https://example.com/front.jpg-full.webp",
      thumbnail: "https://example.com/front.jpg-400w.webp",
    });
    expect(printing.images[1]).toEqual({
      face: "back",
      full: "https://example.com/back.jpg-full.webp",
      thumbnail: "https://example.com/back.jpg-400w.webp",
    });
  });

  it("handles printing with no images", async () => {
    seedDefaults({
      printingImages: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printing = json.printings["OGS-001:rare:normal:"];
    expect(printing.images).toEqual([]);
  });
});
