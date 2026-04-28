import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { landingSummaryRoute } from "./landing-summary";

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

// oxlint-disable-next-line -- test mock doesn't match full Repos type
const app = new Hono()
  .use("*", async (c, next) => {
    c.set("repos", { catalog: mockCatalogRepo } as never);
    await next();
  })
  .route("/api/v1", landingSummaryRoute);

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

  it("returns the cache header /catalog uses so Cloudflare can edge-cache", async () => {
    const res = await app.request("/api/v1/landing-summary");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("returns ETag", async () => {
    const res = await app.request("/api/v1/landing-summary");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  it("returns 304 when If-None-Match matches", async () => {
    const first = await app.request("/api/v1/landing-summary");
    const tag = first.headers.get("ETag") ?? "";
    const second = await app.request("/api/v1/landing-summary", {
      headers: { "If-None-Match": tag },
    });
    expect(second.status).toBe(304);
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
