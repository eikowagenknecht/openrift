import { describe, expect, it, beforeEach } from "bun:test";

import { Hono } from "hono";

import { pricesRoute } from "./prices";

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const PRICES_LAST_MODIFIED = new Date("2026-03-02T00:00:00Z");

const mockState = {
  tables: {} as Record<string, unknown[]>,
};

function createMockDb() {
  return {
    selectFrom: (table: string) => {
      const isSubquery = typeof table !== "string";
      const data = isSubquery
        ? [{ lastModified: PRICES_LAST_MODIFIED }]
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
  .route("/api", pricesRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbPrice = {
  printingId: "OGS-001:rare:normal:",
  marketCents: 275,
  recordedAt: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printingId: "OGS-001:rare:foil:",
  marketCents: 800,
  recordedAt: new Date("2026-03-01"),
};

const dbPrinting = { id: "OGS-001:rare:normal", slug: "OGS-001:rare:normal" };

const dbMarketplaceSource = {
  id: "ms-tcg-1",
  externalId: 12_345,
  marketplace: "tcgplayer",
  printingId: "OGS-001:rare:normal",
};
const dbMarketplaceSourceCM = {
  id: "ms-cm-1",
  externalId: 67_890,
  marketplace: "cardmarket",
  printingId: "OGS-001:rare:normal",
};

const dbSnapshot = {
  id: "snap-1",
  sourceId: "ms-tcg-1",
  recordedAt: new Date("2026-03-01"),
  marketCents: 275,
  lowCents: 200,
  midCents: 250,
  highCents: 400,
  trendCents: null,
  avg1Cents: null,
  avg7Cents: null,
  avg30Cents: null,
};

// ---------------------------------------------------------------------------
// GET /api/prices (latest prices — kept for non-browser consumers)
// ---------------------------------------------------------------------------

describe("GET /api/prices", () => {
  beforeEach(() => {
    mockState.tables = {
      "marketplaceSources as ps": [dbPrice, dbPriceFoil],
      marketplaceSnapshots: [{ lastModified: PRICES_LAST_MODIFIED }],
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
      "marketplaceSources as ps": [],
      marketplaceSnapshots: [{ lastModified: PRICES_LAST_MODIFIED }],
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

describe("GET /api/prices/:printingId/history", () => {
  beforeEach(() => {
    mockState.tables = {
      printings: [dbPrinting],
      marketplaceSources: [dbMarketplaceSource, dbMarketplaceSourceCM],
      marketplaceSnapshots: [dbSnapshot],
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
      marketplaceSources: [],
      marketplaceSnapshots: [],
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

  it("rejects invalid range parameter with 400", async () => {
    const res = await app.request("/api/prices/OGS-001:rare:normal/history?range=invalid");
    expect(res.status).toBe(400);
  });
});
