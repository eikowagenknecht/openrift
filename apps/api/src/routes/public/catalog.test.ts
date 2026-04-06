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
  languages: vi.fn(() => Promise.resolve([])),
};

const mockMarketplaceRepo = {
  latestPrices: vi.fn(() => Promise.resolve([])),
};

// oxlint-disable-next-line -- test mock doesn't match full Repos type
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", {
      catalog: mockCatalogRepo,
      marketplace: mockMarketplaceRepo,
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
  collectorNumber: 1,
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

const dbPrice = {
  printingId: "OGS-001:rare:normal:",
  marketplace: "tcgplayer",
  marketCents: 275,
  recordedAt: new Date("2026-03-01"),
};

function seedDefaults(overrides?: {
  sets?: unknown[];
  cards?: unknown[];
  printings?: unknown[];
  printingImages?: unknown[];
  prices?: unknown[];
  totalCopies?: number;
  languages?: unknown[];
}) {
  mockCatalogRepo.sets.mockResolvedValue(overrides?.sets ?? [dbSet]);
  mockCatalogRepo.cards.mockResolvedValue(overrides?.cards ?? [dbCard]);
  mockCatalogRepo.printings.mockResolvedValue(overrides?.printings ?? [dbPrintingRow]);
  mockCatalogRepo.printingImages.mockResolvedValue(overrides?.printingImages ?? [dbImage]);
  mockCatalogRepo.cardBans.mockResolvedValue([]);
  mockCatalogRepo.cardErrata.mockResolvedValue([]);
  mockCatalogRepo.totalCopies.mockResolvedValue(overrides?.totalCopies ?? 42);
  mockCatalogRepo.languages.mockResolvedValue(
    overrides?.languages ?? [{ code: "EN", name: "English" }],
  );
  mockMarketplaceRepo.latestPrices.mockResolvedValue(overrides?.prices ?? [dbPrice]);
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
    mockCatalogRepo.languages.mockReset();
    mockMarketplaceRepo.latestPrices.mockReset();
    seedDefaults();
  });

  it("returns 200 with normalized CatalogResponse structure", async () => {
    const res = await app.request("/api/v1/catalog");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets).toHaveLength(1);
    expect(json.printings).toHaveLength(1);
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
    const printing = json.printings[0];
    expect(printing.printedRulesText).toBeNull();
    expect(printing.printedEffectText).toBeNull();
    expect(printing.flavorText).toBeNull();
    expect(printing.images).toEqual([]);
    expect(printing.artist).toBe("Alice");
  });

  it("maps printing fields with cardId reference instead of nested card", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const printing = json.printings[0];

    expect(printing.id).toBe("OGS-001:rare:normal:");
    expect(printing.shortCode).toBe("OGS-001");
    expect(printing.collectorNumber).toBe(1);
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.promoType).toBeNull();
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");
    expect(printing.cardId).toBe("OGS-001");
    expect(printing.card).toBeUndefined();
  });

  it("maps image URL into images array", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].images).toEqual([
      { face: "front", url: "https://example.com/thumb.jpg" },
    ]);
  });

  it("passes setId through on printing", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].setId).toBe("OGS");
  });

  it("returns errata as null when no errata exists", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card.errata).toBeNull();
  });

  it("includes latest market price on printing", async () => {
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBe(2.75);
    expect(json.printings[0].marketPrices).toEqual({ tcgplayer: 2.75 });
  });

  it("includes all marketplace prices on printing", async () => {
    seedDefaults({
      prices: [
        dbPrice,
        { printingId: "OGS-001:rare:normal:", marketplace: "cardmarket", marketCents: 350 },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBe(2.75);
    expect(json.printings[0].marketPrices).toEqual({ tcgplayer: 2.75, cardmarket: 3.5 });
  });

  it("omits marketPrice when no price exists", async () => {
    seedDefaults({ prices: [] });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBeUndefined();
    expect(json.printings[0].marketPrices).toBeUndefined();
  });

  it("returns printings from multiple sets as flat array", async () => {
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
    expect(json.printings).toHaveLength(2);
    expect(Object.keys(json.cards)).toHaveLength(2);
  });

  it("returns empty printings when catalog is empty", async () => {
    seedDefaults({
      sets: [],
      cards: [],
      printings: [],
      printingImages: [],
      prices: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings).toEqual([]);
    expect(json.cards).toEqual({});
    expect(json.sets).toEqual([]);
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/v1/catalog");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
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

  it("includes non-tcgplayer prices in marketPrices without setting marketPrice", async () => {
    seedDefaults({
      prices: [{ printingId: "OGS-001:rare:normal:", marketplace: "cardmarket", marketCents: 350 }],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    // Only cardmarket — no tcgplayer, so marketPrice should be undefined
    expect(json.printings[0].marketPrice).toBeUndefined();
    expect(json.printings[0].marketPrices).toEqual({ cardmarket: 3.5 });
  });

  it("groups prices by printing ID across multiple printings", async () => {
    const secondRow = {
      ...dbPrintingRow,
      id: "OGS-002:rare:normal:",
      slug: "OGS-002:rare:normal:",
      cardId: "OGS-001",
      shortCode: "OGS-002",
    };
    seedDefaults({
      printings: [dbPrintingRow, secondRow],
      printingImages: [],
      prices: [
        { printingId: "OGS-001:rare:normal:", marketplace: "tcgplayer", marketCents: 100 },
        { printingId: "OGS-002:rare:normal:", marketplace: "tcgplayer", marketCents: 500 },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBe(1);
    expect(json.printings[1].marketPrice).toBe(5);
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
    expect(json.printings[0].images).toHaveLength(2);
    expect(json.printings[0].images[0]).toEqual({
      face: "front",
      url: "https://example.com/front.jpg",
    });
    expect(json.printings[0].images[1]).toEqual({
      face: "back",
      url: "https://example.com/back.jpg",
    });
  });

  it("handles printing with no images and no prices", async () => {
    seedDefaults({
      printingImages: [],
      prices: [],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].images).toEqual([]);
    expect(json.printings[0].marketPrice).toBeUndefined();
    expect(json.printings[0].marketPrices).toBeUndefined();
  });

  it("handles cardtrader marketplace prices", async () => {
    seedDefaults({
      prices: [
        dbPrice,
        { printingId: "OGS-001:rare:normal:", marketplace: "cardtrader", marketCents: 200 },
      ],
    });
    const res = await app.request("/api/v1/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrices).toEqual({ tcgplayer: 2.75, cardtrader: 2 });
  });
});
