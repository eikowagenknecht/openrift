import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { landingSummaryRouter } from "./landing-summary";

const mockCatalogRepo = {
  landingSummary: vi.fn(() =>
    Promise.resolve({
      cardCount: 0,
      printingCount: 0,
      copyCount: 0,
      thumbnailIds: [] as string[],
    }),
  ),
};

// Mounts the oRPC handler exactly as production does, with the repos injected.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  // oxlint-disable-next-line no-explicit-any -- test stub doesn't match full Repos type
  c.set("repos", { catalog: mockCatalogRepo } as any);
  await next();
});
registerRouterForTest(app, landingSummaryRouter);

describe("GET /api/v1/landing-summary", () => {
  beforeEach(() => {
    mockCatalogRepo.landingSummary.mockReset();
    mockCatalogRepo.landingSummary.mockResolvedValue({
      cardCount: 312,
      printingCount: 468,
      copyCount: 142,
      thumbnailIds: ["abc-001", "def-002"],
    });
  });

  it("returns 200 with the landing summary shape", async () => {
    const res = await app.request("/api/v1/landing-summary");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      cardCount: 312,
      printingCount: 468,
      copyCount: 142,
      thumbnailIds: ["abc-001", "def-002"],
    });
  });

  it("requests at most 36 thumbnails so the desktop scatter is fully populated", async () => {
    await app.request("/api/v1/landing-summary");
    expect(mockCatalogRepo.landingSummary).toHaveBeenCalledWith(36);
  });

  it("returns an empty thumbnailIds array when the catalog has none", async () => {
    mockCatalogRepo.landingSummary.mockResolvedValue({
      cardCount: 0,
      printingCount: 0,
      copyCount: 0,
      thumbnailIds: [],
    });
    const res = await app.request("/api/v1/landing-summary");
    const json = await res.json();
    expect(json.thumbnailIds).toEqual([]);
    expect(json.cardCount).toBe(0);
  });
});
