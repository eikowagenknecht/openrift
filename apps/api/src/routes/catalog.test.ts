import { describe, expect, it, beforeEach } from "bun:test";

import { Hono } from "hono";

import { catalogRoute } from "./catalog";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const CATALOG_LAST_MODIFIED = new Date("2026-03-01T00:00:00Z");
const PRICES_LAST_MODIFIED = new Date("2026-03-02T00:00:00Z");

const mockState = {
  tables: {} as Record<string, unknown[]>,
};

function createMockDb() {
  return {
    selectFrom: (table: string) => {
      const isSubquery = typeof table !== "string";
      const data = isSubquery
        ? [{ last_modified: CATALOG_LAST_MODIFIED }]
        : (mockState.tables[table] ?? []);
      const chain: Record<string, unknown> = {
        selectAll: () => chain,
        select: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        distinctOn: () => chain,
        where: () => chain,
        or: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        execute: () => data,
        executeTakeFirst: () => data[0] ?? undefined,
        executeTakeFirstOrThrow: () => data[0],
      };
      return chain;
    },
  };
}

const mockDb = createMockDb();

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db", mockDb);
    await next();
  })
  .route("/api", catalogRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbSet = { id: "OGS", slug: "OGS", name: "Original Set", printed_total: 100 };

const dbCard = {
  id: "OGS-001",
  slug: "OGS-001",
  name: "Fire Dragon",
  type: "Unit",
  super_types: ["Elite"],
  domains: ["Fury"],
  might: 4,
  energy: 5,
  power: 6,
  might_bonus: 1,
  keywords: ["Shield"],
  rules_text: "A fiery beast",
  effect_text: "Deal 3 damage",
  tags: ["Dragon"],
};

const dbPrintingRow = {
  id: "OGS-001:rare:normal:",
  slug: "OGS-001:rare:normal:",
  card_id: "OGS-001",
  set_id: "OGS",
  source_id: "OGS-001",
  collector_number: 1,
  rarity: "Rare",
  art_variant: "normal",
  is_signed: false,
  is_promo: false,
  finish: "normal",
  artist: "Alice",
  public_code: "ABCD",
  printed_rules_text: "A fiery beast",
  printed_effect_text: "Deal 3 damage",
  flavor_text: null,
  comment: null,
};

const dbImage = {
  printing_id: "OGS-001:rare:normal:",
  face: "front",
  url: "https://example.com/thumb.jpg",
};

const dbPrice = {
  printing_id: "OGS-001:rare:normal:",
  market_cents: 275,
  recorded_at: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printing_id: "OGS-001:rare:foil:",
  market_cents: 800,
  recorded_at: new Date("2026-03-01"),
};

function catalogTables(overrides?: Record<string, unknown[]>) {
  return {
    sets: [dbSet],
    cards: [dbCard],
    printings: [dbPrintingRow],
    printing_images: [dbImage],
    "marketplace_sources as ps": [dbPrice],
    marketplace_snapshots: [{ last_modified: PRICES_LAST_MODIFIED }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/catalog
// ---------------------------------------------------------------------------

describe("GET /api/catalog", () => {
  beforeEach(() => {
    mockState.tables = catalogTables();
  });

  it("returns 200 with normalized RiftboundCatalog structure", async () => {
    const res = await app.request("/api/catalog");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sets).toHaveLength(1);
    expect(json.printings).toHaveLength(1);
    expect(Object.keys(json.cards)).toHaveLength(1);
  });

  it("returns sets as simple { slug, name } objects", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.sets[0]).toEqual({ slug: "OGS", name: "Original Set" });
  });

  it("returns cards keyed by card ID", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card).toBeDefined();
    expect(card.name).toBe("Fire Dragon");
    expect(card.superTypes).toEqual(["Elite"]);
    expect(card.mightBonus).toBe(1);
    expect(card.stats).toEqual({ might: 4, energy: 5, power: 6 });
  });

  it("maps printing fields with cardId reference instead of nested card", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const printing = json.printings[0];

    expect(printing.id).toBe("OGS-001:rare:normal:");
    expect(printing.sourceId).toBe("OGS-001");
    expect(printing.collectorNumber).toBe(1);
    expect(printing.publicCode).toBe("ABCD");
    expect(printing.artVariant).toBe("normal");
    expect(printing.isSigned).toBe(false);
    expect(printing.isPromo).toBe(false);
    expect(printing.finish).toBe("normal");
    expect(printing.artist).toBe("Alice");
    expect(printing.cardId).toBe("OGS-001");
    expect(printing.card).toBeUndefined();
  });

  it("maps image URL into images array", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].images).toEqual([
      { face: "front", url: "https://example.com/thumb.jpg" },
    ]);
  });

  it("maps set_id to printing.set via slug lookup", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].set).toBe("OGS");
  });

  it("uses rules_text as card.rulesText", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    const card = json.cards["OGS-001"];
    expect(card.rulesText).toBe("A fiery beast");
    expect(card.effectText).toBe("Deal 3 damage");
  });

  it("includes latest market price on printing", async () => {
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBe(2.75);
  });

  it("omits marketPrice when no price exists", async () => {
    mockState.tables = catalogTables({ "marketplace_sources as ps": [] });
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings[0].marketPrice).toBeUndefined();
  });

  it("returns printings from multiple sets as flat array", async () => {
    const secondSet = { id: "S2", slug: "S2", name: "Set Two", printed_total: 50 };
    const secondCard = { ...dbCard, id: "S2-001", slug: "S2-001" };
    const secondRow = {
      ...dbPrintingRow,
      id: "S2-001:rare:normal",
      slug: "S2-001:rare:normal",
      card_id: "S2-001",
      source_id: "S2-001",
      set_id: "S2",
    };
    mockState.tables = catalogTables({
      sets: [dbSet, secondSet],
      cards: [dbCard, secondCard],
      printings: [dbPrintingRow, secondRow],
      printing_images: [],
    });

    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.sets).toHaveLength(2);
    expect(json.printings).toHaveLength(2);
    expect(Object.keys(json.cards)).toHaveLength(2);
  });

  it("returns empty printings when catalog is empty", async () => {
    mockState.tables = catalogTables({
      sets: [],
      cards: [],
      printings: [],
      printing_images: [],
      "marketplace_sources as ps": [],
    });
    const res = await app.request("/api/catalog");
    const json = await res.json();
    expect(json.printings).toEqual([]);
    expect(json.cards).toEqual({});
    expect(json.sets).toEqual([]);
  });

  it("returns ETag based on max of catalog and prices timestamps", async () => {
    const res = await app.request("/api/catalog");
    const expectedTs = Math.max(CATALOG_LAST_MODIFIED.getTime(), PRICES_LAST_MODIFIED.getTime());
    expect(res.headers.get("ETag")).toBe(`"catalog-${expectedTs}"`);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const expectedTs = Math.max(CATALOG_LAST_MODIFIED.getTime(), PRICES_LAST_MODIFIED.getTime());
    const etag = `"catalog-${expectedTs}"`;
    const res = await app.request("/api/catalog", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.request("/api/catalog", {
      headers: { "If-None-Match": '"catalog-0"' },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/prices (latest prices — kept for non-browser consumers)
// ---------------------------------------------------------------------------

describe("GET /api/prices", () => {
  beforeEach(() => {
    mockState.tables = {
      "marketplace_sources as ps": [dbPrice, dbPriceFoil],
      marketplace_snapshots: [{ last_modified: PRICES_LAST_MODIFIED }],
    };
  });

  it("returns 200 with PricesData structure", async () => {
    const res = await app.request("/api/prices");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prices).toBeDefined();
  });

  it("converts market_cents to dollars", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    expect(json.prices["OGS-001:rare:normal:"]).toBe(2.75);
  });

  it("returns one entry per printing", async () => {
    const res = await app.request("/api/prices");
    const json = await res.json();
    expect(json.prices["OGS-001:rare:normal:"]).toBe(2.75);
    expect(json.prices["OGS-001:rare:foil:"]).toBe(8);
  });

  it("returns empty prices when no rows exist", async () => {
    mockState.tables = {
      "marketplace_sources as ps": [],
      marketplace_snapshots: [{ last_modified: PRICES_LAST_MODIFIED }],
    };
    const res = await app.request("/api/prices");
    const json = await res.json();
    expect(json.prices).toEqual({});
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/prices");
    expect(res.headers.get("ETag")).toBe(`"prices-${PRICES_LAST_MODIFIED.getTime()}"`);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const etag = `"prices-${PRICES_LAST_MODIFIED.getTime()}"`;
    const res = await app.request("/api/prices", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.request("/api/prices", {
      headers: { "If-None-Match": '"prices-0"' },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/prices/:printingId/history
// ---------------------------------------------------------------------------

const dbPrinting = { id: "OGS-001:rare:normal", slug: "OGS-001:rare:normal" };

const dbMarketplaceSource = {
  id: "ms-tcg-1",
  external_id: 12_345,
  marketplace: "tcgplayer",
  printing_id: "OGS-001:rare:normal",
};
const dbMarketplaceSourceCM = {
  id: "ms-cm-1",
  external_id: 67_890,
  marketplace: "cardmarket",
  printing_id: "OGS-001:rare:normal",
};

const dbSnapshot = {
  id: "snap-1",
  source_id: "ms-tcg-1",
  recorded_at: new Date("2026-03-01"),
  market_cents: 275,
  low_cents: 200,
  mid_cents: 250,
  high_cents: 400,
  trend_cents: null,
  avg1_cents: null,
  avg7_cents: null,
  avg30_cents: null,
};

describe("GET /api/prices/:printingId/history", () => {
  beforeEach(() => {
    mockState.tables = {
      printings: [dbPrinting],
      marketplace_sources: [dbMarketplaceSource, dbMarketplaceSourceCM],
      marketplace_snapshots: [dbSnapshot],
    };
  });

  it("returns 200 with PriceHistoryResponse structure", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.printingId).toBe("OGS-001:rare:normal");
    expect(json.tcgplayer).toBeDefined();
    expect(json.cardmarket).toBeDefined();
  });

  it("returns tcgplayer data with correct currency", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.tcgplayer.available).toBe(true);
    expect(json.tcgplayer.currency).toBe("USD");
    expect(json.tcgplayer.productId).toBe(12_345);
  });

  it("returns cardmarket data with correct currency", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.cardmarket.available).toBe(true);
    expect(json.cardmarket.currency).toBe("EUR");
    expect(json.cardmarket.productId).toBe(67_890);
  });

  it("converts snapshot cents to dollars", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.tcgplayer.snapshots).toHaveLength(1);
    expect(json.tcgplayer.snapshots[0].market).toBe(2.75);
    expect(json.tcgplayer.snapshots[0].low).toBe(2);
    expect(json.tcgplayer.snapshots[0].mid).toBe(2.5);
    expect(json.tcgplayer.snapshots[0].high).toBe(4);
  });

  it("handles null cents values", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.cardmarket.snapshots[0].trend).toBeNull();
    expect(json.cardmarket.snapshots[0].avg1).toBeNull();
  });

  it("formats snapshot date as YYYY-MM-DD", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.tcgplayer.snapshots[0].date).toBe("2026-03-01");
  });

  it("returns unavailable sources for non-existent printing", async () => {
    mockState.tables = { printings: [] };
    const res = await app.request("/api/prices/nonexistent/history");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.printingId).toBe("nonexistent");
    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.snapshots).toEqual([]);
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.snapshots).toEqual([]);
  });

  it("returns unavailable when no marketplace sources exist", async () => {
    mockState.tables = {
      printings: [dbPrinting],
      marketplace_sources: [],
      marketplace_snapshots: [],
    };
    const res = await app.request("/api/prices/OGS-001:rare:normal/history");
    const json = await res.json();
    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.productId).toBeNull();
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.productId).toBeNull();
  });

  it("accepts range query parameter", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history?range=7d");
    expect(res.status).toBe(200);
  });

  it("defaults to 30d range for invalid range parameter", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history?range=invalid");
    expect(res.status).toBe(200);
  });
});
