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
  variantId: "ms-tcg-1",
  externalId: 12_345,
  marketplace: "tcgplayer",
  printingId: "a0000000-0001-4000-a000-000000000001",
};
const dbMarketplaceSourceCM = {
  variantId: "ms-cm-1",
  externalId: 67_890,
  marketplace: "cardmarket",
  printingId: "a0000000-0001-4000-a000-000000000001",
};

const dbSnapshot = {
  id: "snap-1",
  variantId: "ms-tcg-1",
  recordedAt: new Date("2026-03-01"),
  marketCents: 275,
  lowCents: 200,
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
    expect(json.prices["a0000000-0001-4000-a000-000000000001"]).toEqual({ tcgplayer: 2.75 });
  });

  it("returns one entry per printing", async () => {
    const res = await app.request("/api/v1/prices");
    const json = await res.json();
    expect(json.prices["a0000000-0001-4000-a000-000000000001"]).toEqual({ tcgplayer: 2.75 });
    expect(json.prices["a0000000-0001-4000-a000-000000000002"]).toEqual({ tcgplayer: 8 });
  });

  it("groups multiple marketplaces under the same printing", async () => {
    mockMarketplaceRepo.latestPrices.mockResolvedValue([
      {
        printingId: "a0000000-0001-4000-a000-000000000001",
        marketplace: "tcgplayer",
        marketCents: 100,
      },
      {
        printingId: "a0000000-0001-4000-a000-000000000001",
        marketplace: "cardmarket",
        marketCents: 200,
      },
      {
        printingId: "a0000000-0001-4000-a000-000000000001",
        marketplace: "cardtrader",
        marketCents: 300,
      },
    ]);
    const res = await app.request("/api/v1/prices");
    const json = await res.json();
    expect(json.prices["a0000000-0001-4000-a000-000000000001"]).toEqual({
      tcgplayer: 1,
      cardmarket: 2,
      cardtrader: 3,
    });
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
    expect(json.tcgplayer).toBeDefined();
    expect(json.cardmarket).toBeDefined();
    expect(json.cardtrader).toBeDefined();
  });

  it("returns tcgplayer data with available + productId", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.available).toBe(true);
    expect(json.tcgplayer.productId).toBe(12_345);
  });

  it("returns cardmarket data with available + productId", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardmarket.available).toBe(true);
    expect(json.cardmarket.productId).toBe(67_890);
  });

  it("converts snapshot cents to dollars and trims unused fields", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.tcgplayer.snapshots).toHaveLength(1);
    expect(json.tcgplayer.snapshots[0].market).toBe(2.75);
    expect(json.tcgplayer.snapshots[0].low).toBe(2);
    // mid/high are no longer returned
    expect(json.tcgplayer.snapshots[0].mid).toBeUndefined();
    expect(json.tcgplayer.snapshots[0].high).toBeUndefined();
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

  it("defaults to 30d range when no range parameter is provided", async () => {
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    expect(res.status).toBe(200);
    // snapshots called with a cutoff date (30d in the past, not null)
    const cutoffArg = mockMarketplaceRepo.snapshots.mock.calls[0]?.[1];
    expect(cutoffArg).toBeInstanceOf(Date);
  });

  it("uses null cutoff for 'all' range", async () => {
    const res = await app.request(
      "/api/v1/prices/a0000000-0001-4000-a000-000000000001/history?range=all",
    );
    expect(res.status).toBe(200);
    // 'all' range should pass null cutoff
    const cutoffArg = mockMarketplaceRepo.snapshots.mock.calls[0]?.[1];
    expect(cutoffArg).toBeNull();
  });

  it("accepts 90d range parameter", async () => {
    const res = await app.request(
      "/api/v1/prices/a0000000-0001-4000-a000-000000000001/history?range=90d",
    );
    expect(res.status).toBe(200);
  });

  it("returns cardtrader data when cardtrader source exists (low-only snapshot)", async () => {
    const ctSource = {
      variantId: "ms-ct-1",
      externalId: 99_999,
      marketplace: "cardtrader",
      printingId: "a0000000-0001-4000-a000-000000000001",
    };
    mockMarketplaceRepo.sourcesForPrinting.mockResolvedValue([
      dbMarketplaceSource,
      dbMarketplaceSourceCM,
      ctSource,
    ]);
    const ctSnapshot = {
      id: "snap-ct-1",
      variantId: "ms-ct-1",
      recordedAt: new Date("2026-03-01"),
      marketCents: null,
      lowCents: 150,
    };
    mockMarketplaceRepo.snapshots.mockImplementation(async (variantId: string) => {
      if (variantId === "ms-ct-1") {
        return [ctSnapshot];
      }
      if (variantId === "ms-tcg-1") {
        return [dbSnapshot];
      }
      return [dbSnapshot];
    });
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardtrader.available).toBe(true);
    expect(json.cardtrader.productId).toBe(99_999);
    expect(json.cardtrader.snapshots).toHaveLength(1);
    expect(json.cardtrader.snapshots[0].low).toBe(1.5);
    expect(json.cardtrader.snapshots[0].market).toBeUndefined();
  });

  it("returns unavailable cardtrader when no source exists", async () => {
    mockMarketplaceRepo.sourcesForPrinting.mockResolvedValue([dbMarketplaceSource]);
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardtrader.available).toBe(false);
    expect(json.cardtrader.productId).toBeNull();
    expect(json.cardtrader.snapshots).toEqual([]);
  });

  it("uses Cardmarket's lowest listing as the headline market price", async () => {
    const cmSnapshot = {
      id: "snap-cm-1",
      variantId: "ms-cm-1",
      recordedAt: new Date("2026-03-02"),
      marketCents: 300,
      lowCents: 150,
    };
    mockMarketplaceRepo.snapshots.mockImplementation(async (variantId: string) => {
      if (variantId === "ms-cm-1") {
        return [cmSnapshot];
      }
      return [dbSnapshot];
    });
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    // Headline = lowCents (1.50), not marketCents (3.00). CM's `avg` field
    // can be polluted by anomalous sales, so we display the cheapest listing.
    expect(json.cardmarket.snapshots[0].market).toBe(1.5);
    expect(json.cardmarket.snapshots[0].low).toBe(1.5);
    // trend/avg1/avg7/avg30 are no longer returned
    expect(json.cardmarket.snapshots[0].trend).toBeUndefined();
    expect(json.cardmarket.snapshots[0].avg1).toBeUndefined();
    expect(json.cardmarket.snapshots[0].date).toBe("2026-03-02");
  });

  it("falls back to marketCents for Cardmarket when lowCents is null", async () => {
    const cmSnapshot = {
      id: "snap-cm-2",
      variantId: "ms-cm-1",
      recordedAt: new Date("2026-03-03"),
      marketCents: 300,
      lowCents: null,
    };
    mockMarketplaceRepo.snapshots.mockImplementation(async (variantId: string) => {
      if (variantId === "ms-cm-1") {
        return [cmSnapshot];
      }
      return [dbSnapshot];
    });
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardmarket.snapshots[0].market).toBe(3);
    expect(json.cardmarket.snapshots[0].low).toBeNull();
  });

  it("skips Cardmarket snapshots with neither low nor market price", async () => {
    const cmSnapshot = {
      id: "snap-cm-3",
      variantId: "ms-cm-1",
      recordedAt: new Date("2026-03-04"),
      marketCents: null,
      lowCents: null,
    };
    mockMarketplaceRepo.snapshots.mockImplementation(async (variantId: string) => {
      if (variantId === "ms-cm-1") {
        return [cmSnapshot];
      }
      return [dbSnapshot];
    });
    const res = await app.request("/api/v1/prices/a0000000-0001-4000-a000-000000000001/history");
    const json = await res.json();
    expect(json.cardmarket.snapshots).toEqual([]);
  });

  it("rejects non-UUID printingId with 400", async () => {
    const res = await app.request("/api/v1/prices/not-a-uuid/history");
    expect(res.status).toBe(400);
  });
});
