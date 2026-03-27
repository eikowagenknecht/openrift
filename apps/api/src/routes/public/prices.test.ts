import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pricesRoute } from "./prices";

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockCatalogRepo = {
  printingById: vi.fn(() => Promise.resolve(undefined as object | undefined)),
};

const mockMarketplaceRepo = {
  latestPrices: vi.fn(() => Promise.resolve([] as object[])),
  sourcesForPrinting: vi.fn(() => Promise.resolve([] as object[])),
  snapshots: vi.fn(() => Promise.resolve([] as object[])),
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
  .route("/api/v1", pricesRoute);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dbPrice = {
  printingId: "a0000000-0001-4000-a000-000000000001",
  marketplace: "tcgplayer",
  marketCents: 275,
  recordedAt: new Date("2026-03-01"),
};

const dbPriceFoil = {
  printingId: "a0000000-0001-4000-a000-000000000002",
  marketplace: "tcgplayer",
  marketCents: 800,
  recordedAt: new Date("2026-03-01"),
};

const dbPrinting = {
  id: "a0000000-0001-4000-a000-000000000001",
  slug: "a0000000-0001-4000-a000-000000000001",
};

const dbMarketplaceSource = {
  id: "ms-tcg-1",
  externalId: 12_345,
  marketplace: "tcgplayer",
  printingId: "a0000000-0001-4000-a000-000000000001",
};
const dbMarketplaceSourceCM = {
  id: "ms-cm-1",
  externalId: 67_890,
  marketplace: "cardmarket",
  printingId: "a0000000-0001-4000-a000-000000000001",
};

const dbSnapshot = {
  id: "snap-1",
  productId: "ms-tcg-1",
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
// GET /api/v1/prices (latest prices — kept for non-browser consumers)
// ---------------------------------------------------------------------------

describe("GET /api/v1/prices", () => {
  beforeEach(() => {
    mockMarketplaceRepo.latestPrices.mockReset().mockResolvedValue([dbPrice, dbPriceFoil]);
    mockCatalogRepo.printingById.mockReset();
    mockMarketplaceRepo.sourcesForPrinting.mockReset();
    mockMarketplaceRepo.snapshots.mockReset();
  });

  it("returns 200 with PricesResponse structure", async () => {
    const res = await app.request("/api/v1/prices");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prices).toBeDefined();
  });

  it("converts market_cents to dollars", async () => {
    const res = await app.request("/api/v1/prices");
    const json = await res.json();
    expect(json.prices["a0000000-0001-4000-a000-000000000001"]).toBe(2.75);
  });

  it("returns one entry per printing", async () => {
    const res = await app.request("/api/v1/prices");
    const json = await res.json();
    expect(json.prices["a0000000-0001-4000-a000-000000000001"]).toBe(2.75);
    expect(json.prices["a0000000-0001-4000-a000-000000000002"]).toBe(8);
  });

  it("returns empty prices when no rows exist", async () => {
    mockMarketplaceRepo.latestPrices.mockResolvedValue([]);
    const res = await app.request("/api/v1/prices");
    const json = await res.json();
    expect(json.prices).toEqual({});
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/v1/prices");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const first = await app.request("/api/v1/prices");
    const etag = first.headers.get("ETag") ?? "";

    const res = await app.request("/api/v1/prices", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("returns 200 when If-None-Match does not match", async () => {
    const res = await app.request("/api/v1/prices", {
      headers: { "If-None-Match": '"stale"' },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/prices/:printingId/history
// ---------------------------------------------------------------------------

describe("GET /api/v1/prices/:printingId/history", () => {
  beforeEach(() => {
    mockMarketplaceRepo.latestPrices.mockReset();
    mockCatalogRepo.printingById.mockReset().mockResolvedValue(dbPrinting);
    mockMarketplaceRepo.sourcesForPrinting
      .mockReset()
      .mockResolvedValue([dbMarketplaceSource, dbMarketplaceSourceCM]);
    mockMarketplaceRepo.snapshots.mockReset().mockResolvedValue([dbSnapshot]);
  });

  it("returns 200 with PriceHistoryResponse structure", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.printingId).toBe("a0000000-0001-4000-a000-000000000001");
    expect(json.tcgplayer).toBeDefined();
    expect(json.cardmarket).toBeDefined();
  });

  it("returns tcgplayer data with correct currency", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.available).toBe(true);
    expect(json.tcgplayer.currency).toBe("USD");
    expect(json.tcgplayer.productId).toBe(12_345);
  });

  it("returns cardmarket data with correct currency", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardmarket.available).toBe(true);
    expect(json.cardmarket.currency).toBe("EUR");
    expect(json.cardmarket.productId).toBe(67_890);
  });

  it("converts snapshot cents to dollars", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.snapshots).toHaveLength(1);
    expect(json.tcgplayer.snapshots[0].market).toBe(2.75);
    expect(json.tcgplayer.snapshots[0].low).toBe(2);
    expect(json.tcgplayer.snapshots[0].mid).toBe(2.5);
    expect(json.tcgplayer.snapshots[0].high).toBe(4);
  });

  it("handles null cents values", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardmarket.snapshots[0].trend).toBeNull();
    expect(json.cardmarket.snapshots[0].avg1).toBeNull();
  });

  it("formats snapshot date as YYYY-MM-DD", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.snapshots[0].date).toBe("2026-03-01");
  });

  it("returns unavailable sources for non-existent printing", async () => {
    mockCatalogRepo.printingById.mockResolvedValue(undefined);
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-ffffffffffff/history");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.printingId).toBe("a0000000-0001-4000-a000-ffffffffffff");
    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.snapshots).toEqual([]);
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.snapshots).toEqual([]);
  });

  it("returns unavailable when no marketplace sources exist", async () => {
    mockMarketplaceRepo.sourcesForPrinting.mockResolvedValue([]);
    mockMarketplaceRepo.snapshots.mockResolvedValue([]);
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.available).toBe(false);
    expect(json.tcgplayer.productId).toBeNull();
    expect(json.cardmarket.available).toBe(false);
    expect(json.cardmarket.productId).toBeNull();
  });

  it("returns ETag and Cache-Control headers", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
  });

  it("returns 304 when If-None-Match matches current ETag", async () => {
    const first = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const etag = first.headers.get("ETag") ?? "";

    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history", {
      headers: { "If-None-Match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("accepts range query parameter", async () => {
    const res = await app.request(
      "/api/v1/prices/a0000000-0001-4000-a000-000000000001/history?range=7d",
    );
    expect(res.status).toBe(200);
  });

  it("rejects invalid range parameter with 400", async () => {
    const res = await app.request(
      "/api/v1/prices/a0000000-0001-4000-a000-000000000001/history?range=invalid",
    );
    expect(res.status).toBe(400);
  });
});
