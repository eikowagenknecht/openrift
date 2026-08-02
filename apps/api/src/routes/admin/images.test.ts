import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import {
  REGENERATE_IMAGES_KIND,
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  rehostImages,
  runRegenerateImagesJob,
  unrehostImages,
} from "../../services/images/index.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminImagesRouter } from "./images";

const RUN_TEST = "019d4999-4219-72f6-b7bb-640000000001";
const EARLIER_RUN = "019d4999-4219-72f6-b7bb-640000000002";
const RUN_X = "019d4999-4219-72f6-b7bb-640000000003";

// ---------------------------------------------------------------------------
// Mock service module — vitest hoists vi.mock() automatically
// ---------------------------------------------------------------------------

vi.mock("../../services/images/index.js", async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    rehostImages: vi.fn(),
    runRegenerateImagesJob: vi.fn(),
    cleanupOrphanedFiles: vi.fn(),
    clearAllRehosted: vi.fn(),
    getRehostStatus: vi.fn(),
    findBrokenImages: vi.fn(),
    findLowResImages: vi.fn(),
    unrehostImages: vi.fn(),
  };
});

const mockRehostImages = vi.mocked(rehostImages);
const mockRunRegenerateImagesJob = vi.mocked(runRegenerateImagesJob);
const mockCleanupOrphanedFiles = vi.mocked(cleanupOrphanedFiles);
const mockClearAllRehosted = vi.mocked(clearAllRehosted);
const mockGetRehostStatus = vi.mocked(getRehostStatus);
const mockFindBrokenImages = vi.mocked(findBrokenImages);
const mockFindLowResImages = vi.mocked(findLowResImages);
const mockUnrehostImages = vi.mocked(unrehostImages);

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

const mockPrintingImages = {};

const mockCandidateCards = {
  listCardsWithMissingImages: vi.fn(),
};

const mockJobRuns = {
  start: vi.fn(async () => ({ id: RUN_TEST })),
  succeed: vi.fn(),
  fail: vi.fn(),
  findRunning: vi.fn<Repos["jobRuns"]["findRunning"]>(async () => null),
  findLatestForResume: vi.fn<Repos["jobRuns"]["findLatestForResume"]>(async () => null),
  getResult: vi.fn(),
  updateResult: vi.fn(),
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

// Mount the oRPC router directly (without the requireAdmin gate). AppErrors
// thrown by handlers are bridged to ORPCErrors inside the router.
const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("io", mockIo as never);
  c.set("repos", {
    printingImages: mockPrintingImages,
    candidateCards: mockCandidateCards,
    jobRuns: mockJobRuns,
  } as never);
  await next();
});
registerRouterForTest(app, adminImagesRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/admin/v1/rehost-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with rehost result using default limit", async () => {
    const result = { total: 10, rehosted: 8, skipped: 1, failed: 1, errors: ["err1"] };
    mockRehostImages.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/rehost-images", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockRehostImages).toHaveBeenCalledWith(mockIo, mockPrintingImages, 10);
  });

  it("passes custom limit from query param", async () => {
    const result = { total: 5, rehosted: 5, skipped: 0, failed: 0, errors: [] };
    mockRehostImages.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/rehost-images?limit=25", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockRehostImages).toHaveBeenCalledWith(mockIo, mockPrintingImages, 25);
  });
});

describe("POST /api/admin/v1/regenerate-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockJobRuns.start.mockResolvedValue({ id: RUN_TEST });
    mockJobRuns.findRunning.mockResolvedValue(null);
    mockJobRuns.findLatestForResume.mockResolvedValue(null);
    mockRunRegenerateImagesJob.mockResolvedValue({
      snapshot: [],
      totalFiles: 0,
      lastProcessedIndex: -1,
      processed: 0,
      regenerated: 0,
      failed: 0,
      errors: [],
      resumedFromRunId: null,
      cancelRequested: false,
      skipExisting: false,
    });
  });

  it("kicks off a fresh job and returns runId immediately", async () => {
    const res = await app.request("/api/admin/v1/regenerate-images", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ runId: RUN_TEST, status: "running" });
    expect(mockJobRuns.start).toHaveBeenCalledWith({
      kind: REGENERATE_IMAGES_KIND,
      trigger: "admin",
    });
    expect(mockJobRuns.findLatestForResume).toHaveBeenCalledWith(REGENERATE_IMAGES_KIND);
  });

  it("returns already_running when a regenerate job is already in flight", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: EARLIER_RUN });
    const res = await app.request("/api/admin/v1/regenerate-images", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ runId: EARLIER_RUN, status: "already_running" });
    expect(mockJobRuns.start).not.toHaveBeenCalled();
  });

  it("does NOT pass resumeFrom when ?reset=true is present, even if a failed prior run exists", async () => {
    mockJobRuns.findLatestForResume.mockResolvedValue({
      id: "prior-failed",
      kind: REGENERATE_IMAGES_KIND,
      trigger: "admin",
      status: "failed",
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 1,
      errorMessage: "boom",
      noop: null,
      result: {
        snapshot: [{ imageId: "card-1", rehostedUrl: "/m/01/card-1" }],
        totalFiles: 5,
        lastProcessedIndex: 1,
        processed: 2,
        regenerated: 2,
        failed: 0,
        errors: [],
        resumedFromRunId: null,
        cancelRequested: false,
        skipExisting: false,
      },
    });

    const res = await app.request("/api/admin/v1/regenerate-images?reset=true", { method: "POST" });
    expect(res.status).toBe(200);
    expect(mockJobRuns.findLatestForResume).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/v1/regenerate-images/cancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("flips cancelRequested on the running row's checkpoint", async () => {
    mockJobRuns.findRunning.mockResolvedValue({ id: RUN_X });
    mockJobRuns.getResult.mockResolvedValue({
      snapshot: [],
      totalFiles: 5,
      lastProcessedIndex: 1,
      processed: 2,
      regenerated: 2,
      failed: 0,
      errors: [],
      resumedFromRunId: null,
      cancelRequested: false,
      skipExisting: false,
    });

    const res = await app.request("/api/admin/v1/regenerate-images/cancel", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ runId: RUN_X, cancelRequested: true });
    expect(mockJobRuns.updateResult).toHaveBeenCalledWith(
      RUN_X,
      expect.objectContaining({ cancelRequested: true }),
    );
  });

  it("404s when no regenerate job is running", async () => {
    mockJobRuns.findRunning.mockResolvedValue(null);
    const res = await app.request("/api/admin/v1/regenerate-images/cancel", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/v1/cleanup-orphaned", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cleanup result", async () => {
    const result = { scanned: 200, deleted: 5, errors: [] };
    mockCleanupOrphanedFiles.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/cleanup-orphaned", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockCleanupOrphanedFiles).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("POST /api/admin/v1/clear-rehosted", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cleared count", async () => {
    mockClearAllRehosted.mockResolvedValue({ cleared: 42 });

    const res = await app.request("/api/admin/v1/clear-rehosted", { method: "POST" });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual({ cleared: 42 });
    expect(mockClearAllRehosted).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("POST /api/admin/v1/unrehost-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const validUuid1 = "a0000000-0001-4000-a000-000000000001";
  const validUuid2 = "a0000000-0001-4000-a000-000000000002";

  it("returns 200 with unrehost result for valid ids", async () => {
    const result = { total: 2, unrehosted: 2, failed: 0, errors: [] };
    mockUnrehostImages.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/unrehost-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: [validUuid1, validUuid2] }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockUnrehostImages).toHaveBeenCalledWith(mockIo, mockPrintingImages, [
      validUuid1,
      validUuid2,
    ]);
  });

  it("rejects an empty imageIds array", async () => {
    const res = await app.request("/api/admin/v1/unrehost-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: [] }),
    });
    expect(res.status).toBe(400);
    expect(mockUnrehostImages).not.toHaveBeenCalled();
  });

  it("rejects non-uuid ids", async () => {
    const res = await app.request("/api/admin/v1/unrehost-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: ["not-a-uuid"] }),
    });
    expect(res.status).toBe(400);
    expect(mockUnrehostImages).not.toHaveBeenCalled();
  });

  it("surfaces partial failures in the response", async () => {
    const result = { total: 2, unrehosted: 1, failed: 1, errors: [`${validUuid2}: not rehosted`] };
    mockUnrehostImages.mockResolvedValue(result);

    const res = await app.request("/api/admin/v1/unrehost-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds: [validUuid1, validUuid2] }),
    });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
  });
});

describe("GET /api/admin/v1/rehost-status", () => {
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

    const res = await app.request("/api/admin/v1/rehost-status");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockGetRehostStatus).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/admin/v1/broken-images", () => {
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

    const res = await app.request("/api/admin/v1/broken-images");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockFindBrokenImages).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/admin/v1/low-res-images", () => {
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

    const res = await app.request("/api/admin/v1/low-res-images");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(result);
    expect(mockFindLowResImages).toHaveBeenCalledWith(mockIo, mockPrintingImages);
  });
});

describe("GET /api/admin/v1/missing-images", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with cards with missing images", async () => {
    const cards = [
      {
        cardId: "card-1",
        slug: "fire-dragon",
        name: "Fire Dragon",
        byLanguage: [
          { language: "EN", count: 1 },
          { language: "DE", count: 2 },
        ],
      },
      {
        cardId: "card-2",
        slug: "ice-elemental",
        name: "Ice Elemental",
        byLanguage: [{ language: "DE", count: 1 }],
      },
    ];
    mockCandidateCards.listCardsWithMissingImages.mockResolvedValue(cards);

    const res = await app.request("/api/admin/v1/missing-images");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual(cards);
  });

  it("returns empty array when all cards have images", async () => {
    mockCandidateCards.listCardsWithMissingImages.mockResolvedValue([]);

    const res = await app.request("/api/admin/v1/missing-images");
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json).toEqual([]);
  });
});
