import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminOperationsRouter } from "./operations";

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

const mockMarketplace = { refreshLatestPrices: vi.fn() };

const mockCatalog = { refreshCatalogViews: vi.fn(), refreshCardAggregates: vi.fn() };

const mockCardTokens = { recomputeAll: vi.fn() };

const mockJobRuns = {
  start: vi.fn(async () => ({ id: "019d4999-4219-72f6-b7bb-64004e1b1bff" })),
  succeed: vi.fn(async () => undefined),
  fail: vi.fn(async () => undefined),
  findRunning: vi.fn<Repos["jobRuns"]["findRunning"]>(async () => null),
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

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("io", mockIo as never);
  c.set("config", mockConfig as never);
  c.set("repos", {
    marketplaceAdmin: mockMktAdmin,
    marketplace: mockMarketplace,
    catalog: mockCatalog,
    cardTokens: mockCardTokens,
    jobRuns: mockJobRuns,
  } as never);
  await next();
});
registerRouterForTest(app, adminOperationsRouter);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const priceRefreshResult = {
  transformed: { groups: 5, products: 100, prices: 300 },
  upserted: {
    prices: { total: 100, new: 50, updated: 30, unchanged: 20 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/v1/clear-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with deleted counts", async () => {
    mockMktAdmin.clearPriceData.mockResolvedValue({
      prices: 10,
      variants: 15,
      products: 20,
    });

    const res = await app.request("/api/admin/v1/clear-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "tcgplayer" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({
      marketplace: "tcgplayer",
      deleted: { prices: 10, variants: 15, products: 20 },
    });
    expect(mockMktAdmin.clearPriceData).toHaveBeenCalledWith("tcgplayer");
  });

  it("works with cardmarket marketplace", async () => {
    mockMktAdmin.clearPriceData.mockResolvedValue({
      prices: 0,
      variants: 0,
      products: 0,
    });

    const res = await app.request("/api/admin/v1/clear-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketplace: "cardmarket" }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.marketplace).toBe("cardmarket");
  });
});

function resetJobRunMocks() {
  mockJobRuns.start.mockImplementation(async () => ({
    id: "019d4999-4219-72f6-b7bb-64004e1b1bff",
  }));
  mockJobRuns.succeed.mockImplementation(async () => undefined);
  mockJobRuns.fail.mockImplementation(async () => undefined);
  mockJobRuns.findRunning.mockImplementation(async () => null);
}

describe("POST /api/admin/v1/refresh-tcgplayer-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and runs the refresh in the background", async () => {
    mockRefreshTcgplayer.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/admin/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1bff",
      status: "running",
    });
    expect(mockJobRuns.start).toHaveBeenCalledWith({
      kind: "tcgplayer.refresh",
      trigger: "admin",
    });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalledWith(
        "019d4999-4219-72f6-b7bb-64004e1b1bff",
        expect.objectContaining({ result: priceRefreshResult }),
      );
    });
    expect(mockRefreshTcgplayer).toHaveBeenCalled();
  });

  it("returns 'already_running' when a run is already in flight", async () => {
    mockJobRuns.findRunning.mockResolvedValueOnce({ id: "019d4999-4219-72f6-b7bb-64004e1b1c00" });

    const res = await app.request("/api/admin/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1c00",
      status: "already_running",
    });
    expect(mockRefreshTcgplayer).not.toHaveBeenCalled();
    expect(mockJobRuns.start).not.toHaveBeenCalled();
  });

  it("writes a failed row when the background refresh throws", async () => {
    mockRefreshTcgplayer.mockRejectedValue(new Error("upstream 502"));

    const res = await app.request("/api/admin/v1/refresh-tcgplayer-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);

    await vi.waitFor(() => {
      expect(mockJobRuns.fail).toHaveBeenCalledWith(
        "019d4999-4219-72f6-b7bb-64004e1b1bff",
        expect.objectContaining({ errorMessage: "upstream 502" }),
      );
    });
    expect(mockJobRuns.succeed).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/v1/refresh-cardmarket-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and runs refresh in the background", async () => {
    mockRefreshCardmarket.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/admin/v1/refresh-cardmarket-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1bff",
      status: "running",
    });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalled();
    });
    expect(mockRefreshCardmarket).toHaveBeenCalled();
  });
});

// Regression: this endpoint used to await the refresh inline and answer 204.
// In prod the refresh outlives Bun.serve's idle timeout, so the socket was cut
// before the response ("The socket connection was closed unexpectedly").
describe("POST /api/admin/v1/refresh-materialized-views", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and refreshes the views in the background", async () => {
    mockMarketplace.refreshLatestPrices.mockResolvedValue(undefined);
    mockCatalog.refreshCatalogViews.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/refresh-materialized-views", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1bff",
      status: "running",
    });
    expect(mockJobRuns.start).toHaveBeenCalledWith({
      kind: "matviews.refresh",
      trigger: "admin",
    });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalled();
    });
    expect(mockMarketplace.refreshLatestPrices).toHaveBeenCalled();
    expect(mockCatalog.refreshCatalogViews).toHaveBeenCalled();
  });

  it("returns 'already_running' when a refresh is already in flight", async () => {
    mockJobRuns.findRunning.mockResolvedValueOnce({ id: "019d4999-4219-72f6-b7bb-64004e1b1c00" });

    const res = await app.request("/api/admin/v1/refresh-materialized-views", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1c00",
      status: "already_running",
    });
    expect(mockMarketplace.refreshLatestPrices).not.toHaveBeenCalled();
    expect(mockJobRuns.start).not.toHaveBeenCalled();
  });

  it("writes a failed row when the background refresh throws", async () => {
    mockMarketplace.refreshLatestPrices.mockRejectedValue(new Error("deadlock detected"));
    mockCatalog.refreshCatalogViews.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/refresh-materialized-views", {
      method: "POST",
    });
    expect(res.status).toBe(202);

    await vi.waitFor(() => {
      expect(mockJobRuns.fail).toHaveBeenCalledWith(
        "019d4999-4219-72f6-b7bb-64004e1b1bff",
        expect.objectContaining({ errorMessage: "deadlock detected" }),
      );
    });
    expect(mockJobRuns.succeed).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/v1/recompute-card-tokens", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and stores the counts as the run result", async () => {
    mockCardTokens.recomputeAll.mockResolvedValue({ totalCards: 500, withTokens: 42 });
    mockCatalog.refreshCardAggregates.mockResolvedValue(undefined);

    const res = await app.request("/api/admin/v1/recompute-card-tokens", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1bff",
      status: "running",
    });
    expect(mockJobRuns.start).toHaveBeenCalledWith({
      kind: "card_tokens.recompute",
      trigger: "admin",
    });

    await vi.waitFor(() => {
      expect(mockJobRuns.succeed).toHaveBeenCalledWith(
        "019d4999-4219-72f6-b7bb-64004e1b1bff",
        expect.objectContaining({ result: { totalCards: 500, withTokens: 42 } }),
      );
    });
    // The aggregates view reads card_tokens, so it must refresh after the
    // re-derivation, never before.
    const recomputeOrder = mockCardTokens.recomputeAll.mock.invocationCallOrder[0];
    const refreshOrder = mockCatalog.refreshCardAggregates.mock.invocationCallOrder[0];
    expect(recomputeOrder).toBeLessThan(refreshOrder ?? 0);
  });

  it("returns 'already_running' when a recompute is already in flight", async () => {
    mockJobRuns.findRunning.mockResolvedValueOnce({ id: "019d4999-4219-72f6-b7bb-64004e1b1c00" });

    const res = await app.request("/api/admin/v1/recompute-card-tokens", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1c00",
      status: "already_running",
    });
    expect(mockCardTokens.recomputeAll).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/v1/refresh-cardtrader-prices", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetJobRunMocks();
  });

  it("returns 202 with runId and passes api token to background fn", async () => {
    mockRefreshCardtrader.mockResolvedValue(priceRefreshResult);

    const res = await app.request("/api/admin/v1/refresh-cardtrader-prices", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    expect(await readJson(res)).toEqual({
      runId: "019d4999-4219-72f6-b7bb-64004e1b1bff",
      status: "running",
    });

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
