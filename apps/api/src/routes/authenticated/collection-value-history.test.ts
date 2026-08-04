import { Hono } from "hono";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { collectionValueHistoryRouter } from "./collection-value-history";

// ---------------------------------------------------------------------------
// Mock repo
// ---------------------------------------------------------------------------

const mockMarketplaceRepo = {
  collectionValueTimeSeries: vi.fn(() => Promise.resolve([] as object[])),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", { marketplace: mockMarketplaceRepo } as never);
  await next();
});
registerRouterForTest(app, collectionValueHistoryRouter);
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  throw err;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => vi.resetAllMocks());

describe("GET /api/v1/collection-value-history", () => {
  it("returns 200 with the value series mapped to the output shape", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([
      { date: "2026-03-15", valueCents: 125_000, copyCount: 42 },
      { date: "2026-03-16", valueCents: 130_000, copyCount: 43 },
    ]);
    const res = await app.request("/api/v1/collection-value-history");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.series).toHaveLength(2);
    expect(json.series[0]).toEqual({ date: "2026-03-15", valueCents: 125_000, copyCount: 42 });
  });

  it("returns an empty series when the repo has no data", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    const res = await app.request("/api/v1/collection-value-history");
    const json = await readJson(res);
    expect(json.series).toEqual([]);
  });

  it("uses defaults (30d / tcgplayer) and a cutoff when no params are given", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    await app.request("/api/v1/collection-value-history");
    expect(mockMarketplaceRepo.collectionValueTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        marketplace: "tcgplayer",
        collectionIds: null,
        cutoff: expect.any(Date),
      }),
    );
  });

  it("passes a null cutoff for the all-time range", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    await app.request("/api/v1/collection-value-history?range=all");
    expect(mockMarketplaceRepo.collectionValueTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({ cutoff: null }),
    );
  });

  it("splits collectionIds and scope CSV filters into arrays", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    const colA = "a0000000-0001-4000-a000-000000000010";
    const colB = "a0000000-0001-4000-a000-000000000011";
    await app.request(
      `/api/v1/collection-value-history?marketplace=cardmarket&collectionIds=${colA},${colB}&sets=OGS,OGN&signed=true&banned=false`,
    );
    expect(mockMarketplaceRepo.collectionValueTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        marketplace: "cardmarket",
        collectionIds: [colA, colB],
        scope: expect.objectContaining({
          sets: ["OGS", "OGN"],
          signed: true,
          banned: false,
        }),
      }),
    );
  });

  it("splits the exclude CSV filters into arrays", async () => {
    // Regression: the exclude params never reached the repo, so the chart drew
    // a wider collection than the rest of the stats page reported.
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    await app.request(
      "/api/v1/collection-value-history?setsExclude=OGS,OGN&domainsExclude=mind&typesExclude=rune&raritiesExclude=common",
    );
    expect(mockMarketplaceRepo.collectionValueTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          setsExclude: ["OGS", "OGN"],
          domainsExclude: ["mind"],
          typesExclude: ["rune"],
          raritiesExclude: ["common"],
        }),
      }),
    );
  });

  it("passes keyword, tag, size, presence and standard filters through", async () => {
    mockMarketplaceRepo.collectionValueTimeSeries.mockResolvedValue([]);
    await app.request(
      "/api/v1/collection-value-history?keywords=Unique&customTags=staple&cardSizes=oversized&tagsPresence=none&standard=true",
    );
    expect(mockMarketplaceRepo.collectionValueTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          keywords: ["Unique"],
          customTags: ["staple"],
          cardSizes: ["oversized"],
          tagsPresence: "none",
          standard: true,
        }),
      }),
    );
  });

  it("returns 400 for an invalid range value", async () => {
    const res = await app.request("/api/v1/collection-value-history?range=bogus");
    expect(res.status).toBe(400);
    expect(mockMarketplaceRepo.collectionValueTimeSeries).not.toHaveBeenCalled();
  });
});
