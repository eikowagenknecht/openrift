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
  reconcileStagingSnapshots: vi.fn(),
};

const mockMarketplace = { refreshLatestPrices: vi.fn() };

const mockJobRuns = {
  start: vi.fn(async () => ({ id: "run-abc" })),
  succeed: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
  findRunning: vi.fn(async () => null),
  listRecent: vi.fn(),
  getLatestPerKind: vi.fn(),
  sweepOrphaned: vi.fn(),
  purgeOlderThan: vi.fn(),
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
      marketplace: mockMarketplace,
      catalog: { refreshCardAggregates: vi.fn() },
      jobRuns: mockJobRuns,
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
      variants: 15,
      products: 20,
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
      deleted: { snapshots: 10, variants: 15, products: 20, staging: 5 },
    });
    expect(mockMktAdmin.clearPriceData).toHaveBeenCalledWith("tcgplayer");
  });

  it("works with cardmarket marketplace", async () => {
    mockMktAdmin.clearPriceData.mockResolvedValue({
      snapshots: 0,
      variants: 0,
      products: 0,
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

function resetJobRunMocks() {
  mockJobRuns.start.mockImplementation(async () => ({ id: "run-abc" }));
  mockJobRuns.succeed.mockImplementation(async () => undefined);
  mockJobRuns.fail.mockImplementation(async () => undefined);
  mockJobRuns.findRunning.mockImplementation(async () => null);
}

describe("POST /api/v1/refresh-tcgplayer-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and runs the refresh in the background", async () => {
    mockRefreshTcgplayer.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "run-abc", status: "running" });
    expect(mockJobRuns.start).toHaveBeenCalledWith({
      kind: "tcgplayer.refresh",
      trigger: "admin",
    });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalledWith(
        "run-abc",
        expect.objectContaining({ result: priceRefreshResult }),
      );
    });
    expect(mockRefreshTcgplayer).toHaveBeenCalled();
  });

  it("returns 'already_running' when a run is already in flight", async () => {
    mockJobRuns.findRunning.mockResolvedValueOnce({ id: "existing-run" });

    const res = await app.request("/api/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "existing-run", status: "already_running" });
    expect(mockRefreshTcgplayer).not.toHaveBeenCalled();
    expect(mockJobRuns.start).not.toHaveBeenCalled();
  });

  it("writes a failed row when the background refresh throws", async () => {
    mockRefreshTcgplayer.mockRejectedValue(new Error("upstream 502"));

    const res = await app.request("/api/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);

    await vi.waitFor(() => {
      expect(mockJobRuns.fail).toHaveBeenCalledWith(
        "run-abc",
        expect.objectContaining({ errorMessage: "upstream 502" }),
      );
    });
    expect(mockJobRuns.succeed).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/refresh-cardmarket-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and runs refresh in the background", async () => {
    mockRefreshCardmarket.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-cardmarket-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "run-abc", status: "running" });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalled();
    });
    expect(mockRefreshCardmarket).toHaveBeenCalled();
  });
});

describe("POST /api/v1/refresh-cardtrader-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and passes api token to background fn", async () => {
    mockRefreshCardtrader.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/v1/refresh-cardtrader-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: "run-abc", status: "running" });

    await vi.waitFor(() => {
      expect(mockRefreshCardtrader).toHaveBeenCalledWith(
        mockIo.fetch,
        expect.objectContaining({ marketplaceAdmin: mockMktAdmin }),
        expect.anything(),
        "test-token-123",
      );
    });
  });
});

describe("POST /api/v1/reconcile-snapshots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with inserted count and refreshes latest prices when rows inserted", async () => {
    mockMktAdmin.reconcileStagingSnapshots.mockResolvedValue(14);

    const res = await app.request("/api/v1/reconcile-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "cardtrader" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ marketplace: "cardtrader", snapshotsInserted: 14 });
    expect(mockMktAdmin.reconcileStagingSnapshots).toHaveBeenCalledWith("cardtrader");
    expect(mockMarketplace.refreshLatestPrices).toHaveBeenCalled();
  });

  it("skips the latest-price refresh when no rows were inserted", async () => {
    mockMktAdmin.reconcileStagingSnapshots.mockResolvedValue(0);

    const res = await app.request("/api/v1/reconcile-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "tcgplayer" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.snapshotsInserted).toBe(0);
    expect(mockMarketplace.refreshLatestPrices).not.toHaveBeenCalled();
  });
});
