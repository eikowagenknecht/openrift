import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { landingSummaryRouter } from "./public-landing-summary";

const thumbnail = (imageId: string, rarity: string, domains: string[]) => ({
  imageId,
  rarity,
  domains,
  name: "Jinx, Rebel",
  shortCode: "OGN-202",
  variantLabel: null,
  priceCents: 420,
});

const promoSection = () => ({
  path: ["Nexus Night", "Spiritforged"],
  printingCount: 40,
  printings: [
    {
      imageId: "ghi-003",
      name: "Navori Scout",
      shortCode: "SFD-037",
      rarity: "common",
      markers: ["Promo"],
    },
  ],
});

const mockCatalogRepo = {
  landingSummary: vi.fn(() =>
    Promise.resolve({
      cardCount: 0,
      printingCount: 0,
      copyCount: 0,
      thumbnails: [] as ReturnType<typeof thumbnail>[],
    }),
  ),
  landingLegendThumbnails: vi.fn(() => Promise.resolve([] as string[])),
  landingPromoSections: vi.fn(() => Promise.resolve([] as ReturnType<typeof promoSection>[])),
};

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
        thumbnail("abc-001", "epic", ["fury"]),
        thumbnail("def-002", "common", ["order", "calm"]),
      ],
    });
    mockCatalogRepo.landingLegendThumbnails.mockReset();
    mockCatalogRepo.landingLegendThumbnails.mockResolvedValue(["leg-001", "leg-002"]);
    mockCatalogRepo.landingPromoSections.mockReset();
    mockCatalogRepo.landingPromoSections.mockResolvedValue([promoSection()]);
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
        thumbnail("abc-001", "epic", ["fury"]),
        thumbnail("def-002", "common", ["order", "calm"]),
      ],
      legendThumbnailIds: ["leg-001", "leg-002"],
      promoSections: [promoSection()],
    });
  });

  it("requests at most 36 thumbnails so the desktop scatter is fully populated", async () => {
    await app.request("/api/v1/landing-summary");
    expect(mockCatalogRepo.landingSummary).toHaveBeenCalledWith(36);
  });

  it("asks for one promo section of two printings", async () => {
    await app.request("/api/v1/landing-summary");
    expect(mockCatalogRepo.landingPromoSections).toHaveBeenCalledWith(1, 2);
  });

  it("asks for the ten legends the tier-list vignette's board and pool hold", async () => {
    await app.request("/api/v1/landing-summary");
    expect(mockCatalogRepo.landingLegendThumbnails).toHaveBeenCalledWith(10);
  });

  it("returns an empty thumbnailIds array when the catalog has none", async () => {
    mockCatalogRepo.landingSummary.mockResolvedValue({
      cardCount: 0,
      printingCount: 0,
      copyCount: 0,
      thumbnails: [],
    });
    mockCatalogRepo.landingPromoSections.mockResolvedValue([]);
    const res = await app.request("/api/v1/landing-summary");
    const json = await readJson(res);
    expect(json.thumbnailIds).toEqual([]);
    expect(json.cardCount).toBe(0);
  });
});
