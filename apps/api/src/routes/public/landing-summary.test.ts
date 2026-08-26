import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { landingSummaryRouter } from "./landing-summary";

const mockCatalogRepo = {
  landingSummary: vi.fn(() =>
    Promise.resolve({
      cardCount: 0,
      printingCount: 0,
      copyCount: 0,
      thumbnails: [] as { imageId: string; rarity: string; domains: string[] }[],
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
      thumbnails: [
        { imageId: "abc-001", rarity: "epic", domains: ["fury"] },
        { imageId: "def-002", rarity: "common", domains: ["order", "calm"] },
      ],
    });
  });

  it("returns 200 with the landing summary shape", async () => {
    const res = await app.request("/api/v1/landing-summary");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({
      cardCount: 312,
      printingCount: 468,
      copyCount: 142,
      thumbnailIds: ["abc-001", "def-002"],
      thumbnails: [
        { imageId: "abc-001", rarity: "epic", domains: ["fury"] },
        { imageId: "def-002", rarity: "common", domains: ["order", "calm"] },
      ],
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
      thumbnails: [],
    });
    const res = await app.request("/api/v1/landing-summary");
    const json = await readJson(res);
    expect(json.thumbnailIds).toEqual([]);
    expect(json.cardCount).toBe(0);
  });
});
