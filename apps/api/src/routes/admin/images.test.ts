import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  regenerateImages,
  rehostImages,
} from "../../services/image-rehost.js";
import { imagesRoute } from "./images";

// ---------------------------------------------------------------------------
// Mock service module — vitest hoists vi.mock() automatically
// ---------------------------------------------------------------------------

vi.mock("../../services/image-rehost.js", () => ({
  rehostImages: vi.fn(),
  regenerateImages: vi.fn(),
  cleanupOrphanedFiles: vi.fn(),
  clearAllRehosted: vi.fn(),
  getRehostStatus: vi.fn(),
  findBrokenImages: vi.fn(),
  findLowResImages: vi.fn(),
}));

const mockRehostImages = vi.mocked(rehostImages);
const mockRegenerateImages = vi.mocked(regenerateImages);
const mockCleanupOrphanedFiles = vi.mocked(cleanupOrphanedFiles);
const mockClearAllRehosted = vi.mocked(clearAllRehosted);
const mockGetRehostStatus = vi.mocked(getRehostStatus);
const mockFindBrokenImages = vi.mocked(findBrokenImages);
const mockFindLowResImages = vi.mocked(findLowResImages);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockPrintingImages = {
  restoreFromSources: vi.fn(),
};

const mockCandidateCards = {
  listCardsWithMissingImages: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const mockIo = { fetch: vi.fn() };

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("io", mockIo as never);
    c.set("repos", {
      printingImages: mockPrintingImages,
      candidateCards: mockCandidateCards,
    } as never);
    await next();
  })
  .route("/api/v1", imagesRoute);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/rehost-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehost result using default limit", async () => {
    const result = { total: 10, rehosted: 8, skipped: 1, failed: 1, errors: ["err1"] };
    mockRehostImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/rehost-images", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockRehostImages).toHaveBeenCalledWith(mockIo, mockPrintingImages, 10);
  });

  it("passes custom limit from query param", async () => {
    const result = { total: 5, rehosted: 5, skipped: 0, failed: 0, errors: [] };
    mockRehostImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/rehost-images?limit=25", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockRehostImages).toHaveBeenCalledWith(mockIo, mockPrintingImages, 25);
  });
});

describe("POST /api/v1/regenerate-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with regenerate result using default offset", async () => {
    const result = {
      total: 100,
      regenerated: 50,
      failed: 2,
      errors: [],
      hasMore: true,
      totalFiles: 200,
    };
    mockRegenerateImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/regenerate-images", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockRegenerateImages).toHaveBeenCalledWith(mockIo, 0);
  });

  it("passes custom offset from query param", async () => {
    const result = {
      total: 50,
      regenerated: 50,
      failed: 0,
      errors: [],
      hasMore: false,
      totalFiles: 100,
    };
    mockRegenerateImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/regenerate-images?offset=50", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockRegenerateImages).toHaveBeenCalledWith(mockIo, 50);
  });
});

describe("POST /api/v1/cleanup-orphaned", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cleanup result", async () => {
    const result = { scanned: 200, deleted: 5, errors: [] };
    mockCleanupOrphanedFiles.mockResolvedValue(result);

    const res = await app.request("/api/v1/cleanup-orphaned", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockCleanupOrphanedFiles).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("POST /api/v1/clear-rehosted", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cleared count", async () => {
    mockClearAllRehosted.mockResolvedValue({ cleared: 42 });

    const res = await app.request("/api/v1/clear-rehosted", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ cleared: 42 });
    expect(mockClearAllRehosted).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/v1/rehost-status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehost status", async () => {
    const result = {
      total: 500,
      rehosted: 400,
      external: 100,
      orphanedFiles: 5,
      sets: [
        {
          setId: "origin",
          setName: "Origin Set",
          total: 100,
          rehosted: 80,
          external: 20,
        },
      ],
      disk: {
        totalBytes: 1_024_000,
        byResolution: [{ resolution: "full", bytes: 1_024_000, fileCount: 80 }],
        sets: [{ setId: "origin", bytes: 1_024_000, fileCount: 80 }],
      },
    };
    mockGetRehostStatus.mockResolvedValue(result);

    const res = await app.request("/api/v1/rehost-status");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockGetRehostStatus).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/v1/broken-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with broken images", async () => {
    const result = {
      total: 2,
      broken: [
        {
          imageId: "img-1",
          rehostedUrl: "/cards/origin/img-1.avif",
          originalUrl: "https://example.com/img1.png",
          cardSlug: "fire-dragon",
          cardName: "Fire Dragon",
          printingShortCode: "OGS-001",
          setSlug: "origin",
        },
      ],
    };
    mockFindBrokenImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/broken-images");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockFindBrokenImages).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/v1/low-res-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with low-res images", async () => {
    const result = {
      total: 1,
      lowRes: [
        {
          imageId: "img-2",
          rehostedUrl: "/cards/origin/img-2.avif",
          originalUrl: "https://example.com/img2.png",
          cardSlug: "ice-elemental",
          cardName: "Ice Elemental",
          printingShortCode: "OGS-002",
          setSlug: "origin",
          width: 200,
          height: 300,
        },
      ],
    };
    mockFindLowResImages.mockResolvedValue(result);

    const res = await app.request("/api/v1/low-res-images");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(result);
    expect(mockFindLowResImages).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/v1/missing-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cards with missing images", async () => {
    const cards = [
      { cardId: "card-1", slug: "fire-dragon", name: "Fire Dragon" },
      { cardId: "card-2", slug: "ice-elemental", name: "Ice Elemental" },
    ];
    mockCandidateCards.listCardsWithMissingImages.mockResolvedValue(cards);

    const res = await app.request("/api/v1/missing-images");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(cards);
  });

  it("returns empty array when all cards have images", async () => {
    mockCandidateCards.listCardsWithMissingImages.mockResolvedValue([]);

    const res = await app.request("/api/v1/missing-images");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("POST /api/v1/restore-image-urls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with provider and updated count", async () => {
    mockPrintingImages.restoreFromSources.mockResolvedValue(15);

    const res = await app.request("/api/v1/restore-image-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "tcgplayer" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ provider: "tcgplayer", updated: 15 });
    expect(mockPrintingImages.restoreFromSources).toHaveBeenCalledWith("tcgplayer");
  });

  it("returns 0 updated when no images to restore", async () => {
    mockPrintingImages.restoreFromSources.mockResolvedValue(0);

    const res = await app.request("/api/v1/restore-image-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "cardmarket" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ provider: "cardmarket", updated: 0 });
  });
});
