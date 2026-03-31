import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import { operationsRoute } from "./operations";

// ---------------------------------------------------------------------------
// Mock service modules — vitest hoists vi.mock() automatically
// ---------------------------------------------------------------------------

vi.mock("../../services/price-refresh/index.js", () => ({
  refreshTcgplayerPrices: vi.fn(),
  refreshCardmarketPrices: vi.fn(),
  refreshCardtraderPrices: vi.fn(),
}));

const mockRefreshTcgplayer = vi.mocked(refreshTcgplayerPrices);
const mockRefreshCardmarket = vi.mocked(refreshCardmarketPrices);
const mockRefreshCardtrader = vi.mocked(refreshCardtraderPrices);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockMktAdmin = {
  clearPriceData: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const mockIo = { fetch: vi.fn() };
const mockConfig = { cardtraderApiToken: "test-token-123" };

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("io", mockIo as never);
    c.set("config", mockConfig as never);
    c.set("repos", {
      marketplaceAdmin: mockMktAdmin,
    } as never);
    await next();
  })
  .route("/api/v1", operationsRoute)
  .onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code }, err.status as 400);
    }
    throw err;
  });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const priceRefreshResult = {
  transformed: { groups: 5, products: 100, prices: 300 },
  upserted: {
    snapshots: { total: 100, new: 50, updated: 30, unchanged: 20 },
    staging: { total: 100, new: 40, updated: 35, unchanged: 25 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/clear-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with deleted counts", async () => {
    mockMktAdmin.clearPriceData.mockResolvedValue({
      snapshots: 10,
      sources: 20,
      staging: 5,
    });

    const res = await app.request("/api/v1/clear-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "tcgplayer" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      marketplace: "tcgplayer",
      deleted: { snapshots: 10, products: 20, staging: 5 },
    });
    expect(mockMktAdmin.clearPriceData).toHaveBeenCalledWith("tcgplayer");
  });

  it("works with cardmarket marketplace", async () => {
    mockMktAdmin.clearPriceData.mockResolvedValue({
      snapshots: 0,
      sources: 0,
      staging: 0,
    });

    const res = await app.request("/api/v1/clear-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "cardmarket" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marketplace).toBe("cardmarket");
  });
});

describe("POST /api/v1/refresh-tcgplayer-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with refresh result", async () => {
    mockRefreshTcgplayer.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(priceRefreshResult);
    expect(mockRefreshTcgplayer).toHaveBeenCalledWith(
      mockIo.fetch,
      expect.objectContaining({ marketplaceAdmin: mockMktAdmin }),
      expect.anything(),
    );
  });
});

describe("POST /api/v1/refresh-cardmarket-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with refresh result", async () => {
    mockRefreshCardmarket.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-cardmarket-prices", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(priceRefreshResult);
    expect(mockRefreshCardmarket).toHaveBeenCalledWith(
      mockIo.fetch,
      expect.objectContaining({ marketplaceAdmin: mockMktAdmin }),
      expect.anything(),
    );
  });
});

describe("POST /api/v1/refresh-cardtrader-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with refresh result and passes api token", async () => {
    mockRefreshCardtrader.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-cardtrader-prices", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(priceRefreshResult);
    expect(mockRefreshCardtrader).toHaveBeenCalledWith(
      mockIo.fetch,
      expect.objectContaining({ marketplaceAdmin: mockMktAdmin }),
      expect.anything(),
      "test-token-123",
    );
  });
});
