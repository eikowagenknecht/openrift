import { isRegenerateImagesCheckpoint } from "@openrift/shared/contracts/admin/job-results";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  makeMockRepo,
  mockFetch,
  mockIo,
  mockReadFile,
  mockReaddir,
  mockSharpInstance,
  mockUnlink,
  mockWriteFile,
  resetImageMocks,
} from "../../test/image-mocks.js";
import {
  regenerateImagesBatch,
  rehostImageFile,
  rehostImages,
  rehostSingleImage,
  runRegenerateImagesJob,
  unrehostImages,
} from "./jobs.js";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetImageMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("rehostImages", () => {
  it("returns zeros when no images found", async () => {
    const result = await rehostImages(mockIo, makeMockRepo());
    expect(result).toEqual({ total: 0, rehosted: 0, skipped: 0, failed: 0, errors: [] });
  });

  it("rehosts an image", async () => {
    const repo = makeMockRepo({
      selectResult: [
        {
          imageId: "img-001",
          originalUrl: "https://example.com/img.png",
        },
      ],
    });

    const result = await rehostImages(mockIo, repo);
    expect(result).toEqual({ total: 1, rehosted: 1, skipped: 0, failed: 0, errors: [] });
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/img.png", {
      headers: { Referer: "https://example.com/" },
      signal: expect.any(AbortSignal),
      redirect: "manual",
    });
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("skips null originalUrl", async () => {
    const repo = makeMockRepo({
      selectResult: [{ imageId: "img-1", originalUrl: null }],
    });
    const result = await rehostImages(mockIo, repo);
    expect(result.skipped).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("counts download failures", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const repo = makeMockRepo({
      selectResult: [{ imageId: "img-1", originalUrl: "https://x.com/img" }],
    });
    const result = await rehostImages(mockIo, repo);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Network error");
  });

  it("handles non-Error thrown values", async () => {
    mockFetch.mockRejectedValue("string-error");
    const repo = makeMockRepo({
      selectResult: [{ imageId: "img-1", originalUrl: "https://x.com/img" }],
    });
    const result = await rehostImages(mockIo, repo);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("string-error");
  });

  it("processes a mixed batch of success, skip, and failure", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(Buffer.from("ok"), { headers: { "content-type": "image/png" } }),
      )
      .mockRejectedValueOnce(new Error("timeout"));

    const repo = makeMockRepo({
      selectResult: [
        {
          imageId: "img-1",
          originalUrl: "https://example.com/ok.png",
        },
        { imageId: "img-2", originalUrl: null },
        {
          imageId: "img-3",
          originalUrl: "https://example.com/fail.png",
        },
      ],
    });

    const result = await rehostImages(mockIo, repo);
    expect(result.total).toBe(3);
    expect(result.rehosted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("timeout");
  });

  it("respects a custom limit parameter", async () => {
    const repo = makeMockRepo({
      selectResult: [
        {
          imageId: "img-1",
          originalUrl: "https://example.com/img.png",
        },
      ],
    });
    const result = await rehostImages(mockIo, repo, 5);
    expect(result.rehosted).toBe(1);
  });
});

describe("rehostSingleImage", () => {
  // The repo pair the two-step lookup needs: a printing image resolves to its
  // `image_files` id, and the rehost inputs are read from that row.
  function makeRehostRepo(
    file: { originalUrl: string | null; rotation?: number; needsTrim?: boolean } | null,
    imageFileId = "00594247-a18a-4efd-8998-105449a4cf40",
  ) {
    return {
      getForRehost: vi.fn(async () => (file === null ? null : { id: "img-1", imageFileId })),
      getImageFileForRehost: vi.fn(async () =>
        file === null
          ? undefined
          : {
              id: imageFileId,
              originalUrl: file.originalUrl,
              rehostedUrl: null,
              rotation: file.rotation ?? 0,
              needsTrim: file.needsTrim ?? false,
            },
      ),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;
  }

  it("does nothing when image has no originalUrl", async () => {
    const repo = makeRehostRepo({ originalUrl: null });

    await rehostSingleImage(mockIo, repo, "img-1");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });

  it("does nothing when image is not found", async () => {
    const repo = makeRehostRepo(null);

    await rehostSingleImage(mockIo, repo, "img-1");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(repo.getImageFileForRehost).not.toHaveBeenCalled();
  });

  it("downloads, processes, and updates the rehosted URL", async () => {
    const repo = makeRehostRepo({ originalUrl: "https://example.com/img.png" });

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(mockFetch).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4cf40",
      "/media/cards/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });

  it("propagates needsTrim from the image_file row to the scan analysis", async () => {
    const repo = makeRehostRepo({
      originalUrl: "https://example.com/img.png",
      needsTrim: true,
    });

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(mockSharpInstance.greyscale).toHaveBeenCalled();
  });

  it("swallows download errors silently", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    const repo = makeRehostRepo({ originalUrl: "https://example.com/img.png" });

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });

  it("rehosts an image file with no printing image behind it", async () => {
    // Substitute art pinned from a URL has an image_files row and deliberately
    // no printing_images row, so it can only be reached by file id.
    const repo = makeRehostRepo({ originalUrl: "https://example.com/pinned.png" });

    await rehostImageFile(mockIo, repo, "00594247-a18a-4efd-8998-105449a4cf40");

    expect(repo.getForRehost).not.toHaveBeenCalled();
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4cf40",
      "/media/cards/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });

  it("does nothing when the image file is gone", async () => {
    const repo = makeRehostRepo(null);

    await rehostImageFile(mockIo, repo, "00594247-a18a-4efd-8998-105449a4cf40");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });
});

describe("unrehostImages", () => {
  function makeUnrehostRepo(
    files: Record<string, { originalUrl: string | null; rehostedUrl: string | null }>,
  ) {
    const updateRehostedUrl = vi.fn(() => Promise.resolve());
    return {
      updateRehostedUrl,
      getImageFileById: vi.fn((id: string) => {
        const file = files[id];
        return Promise.resolve(
          file ? { id, originalUrl: file.originalUrl, rehostedUrl: file.rehostedUrl } : undefined,
        );
      }),
    } as any;
  }

  it("returns zeros when called with an empty list", async () => {
    const repo = makeUnrehostRepo({});
    const result = await unrehostImages(mockIo, repo, []);
    expect(result).toEqual({ total: 0, unrehosted: 0, failed: 0, errors: [] });
  });

  it("clears rehostedUrl and deletes disk files for the image_file", async () => {
    const repo = makeUnrehostRepo({
      "file-1": { originalUrl: "https://example.com/x.png", rehostedUrl: "/media/cards/01/file-1" },
    });
    mockReaddir.mockResolvedValue(["file-1-orig.png", "file-1-400w.webp"]);

    const result = await unrehostImages(mockIo, repo, ["file-1"]);

    expect(result).toEqual({ total: 1, unrehosted: 1, failed: 0, errors: [] });
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith("file-1", null);
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("still succeeds when the disk directory is already gone (broken-entry case)", async () => {
    const repo = makeUnrehostRepo({
      "file-1": { originalUrl: "https://example.com/x.png", rehostedUrl: "/media/cards/01/file-1" },
    });
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await unrehostImages(mockIo, repo, ["file-1"]);

    expect(result).toEqual({ total: 1, unrehosted: 1, failed: 0, errors: [] });
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith("file-1", null);
  });

  it("records a failure when the image is not rehosted", async () => {
    const repo = makeUnrehostRepo({
      "file-1": { originalUrl: "https://example.com/x.png", rehostedUrl: null },
    });
    const result = await unrehostImages(mockIo, repo, ["file-1"]);
    expect(result.unrehosted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("not rehosted");
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });

  it("records a failure for an uploaded image with no originalUrl (can't re-fetch)", async () => {
    const repo = makeUnrehostRepo({
      "file-uploaded": { originalUrl: null, rehostedUrl: "/media/cards/ed/file-uploaded" },
    });
    const result = await unrehostImages(mockIo, repo, ["file-uploaded"]);
    expect(result.unrehosted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("no original URL");
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("records a failure when the image_file is unknown", async () => {
    const repo = makeUnrehostRepo({});
    const result = await unrehostImages(mockIo, repo, ["missing-id"]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("missing-id");
    expect(result.errors[0]).toContain("not found");
  });

  it("continues past per-item errors and reports mixed results", async () => {
    const repo = makeUnrehostRepo({
      "file-ok": {
        originalUrl: "https://example.com/ok.png",
        rehostedUrl: "/media/cards/01/file-ok",
      },
      "file-not-rehosted": { originalUrl: "https://example.com/nr.png", rehostedUrl: null },
    });
    const result = await unrehostImages(mockIo, repo, [
      "file-ok",
      "file-not-rehosted",
      "file-gone",
    ]);
    expect(result.total).toBe(3);
    expect(result.unrehosted).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.errors).toHaveLength(2);
  });
});

// Build a {imageId, rehostedUrl} entry shaped like `listAllRehosted` rows for
// the per-batch helper.
function snap(imageId: string, rehostedUrl?: string) {
  return { imageId, rehostedUrl: rehostedUrl ?? `/media/cards/${imageId.slice(-2)}/${imageId}` };
}

describe("regenerateImagesBatch", () => {
  it("returns empty totals on an empty batch (no repo or fs reads)", async () => {
    const repo = makeMockRepo({});
    const result = await regenerateImagesBatch(mockIo, repo, []);
    expect(result).toEqual({ regenerated: 0, failed: 0, errors: [] });
    expect(repo.getRotationsAndTrimByIds).not.toHaveBeenCalled();
  });

  it("regenerates variants from on-disk orig files for each entry", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockImplementation(async () => ["card-001-orig.png", "card-002-orig.jpg"]);
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001"), snap("card-002")]);
    expect(result.regenerated).toBe(2);
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it("clears stale rehostedUrl when the prefix dir is missing entirely", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await regenerateImagesBatch(mockIo, repo, [
      snap("card-001", "/media/cards/01/card-001"),
    ]);
    expect(result.failed).toBe(1);
    expect(result.regenerated).toBe(0);
    expect(result.errors[0]).toContain("prefix dir missing");
    expect(result.errors[0]).toContain("cleared stale rehostedUrl");
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith("card-001", null);
  });

  it("deletes dangling variants and clears DB when -orig is missing", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockImplementation(async () => ["card-001-400w.webp", "card-001-full.webp"]);
    const result = await regenerateImagesBatch(mockIo, repo, [
      snap("card-001", "/media/cards/01/card-001"),
    ]);
    expect(result.failed).toBe(1);
    expect(result.regenerated).toBe(0);
    expect(result.errors[0]).toContain("no -orig file on disk");
    expect(result.errors[0]).toContain("cleared stale rehostedUrl");
    expect(mockUnlink).toHaveBeenCalled();
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith("card-001", null);
  });

  it("does not clear rehostedUrl for uploaded images (no originalUrl) when -orig is missing", async () => {
    // Calling `updateRehostedUrl(id, null)` regardless of originalUrl would
    // violate the `chk_image_files_has_url` CHECK for uploaded images (no
    // originalUrl set).
    const repo = makeMockRepo({
      imageFile: { id: "card-001", originalUrl: null, rehostedUrl: "/some/url" },
    });
    mockReaddir.mockImplementation(async () => ["card-001-400w.webp"]);
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")]);
    expect(result.failed).toBe(1);
    expect(result.regenerated).toBe(0);
    expect(result.errors[0]).toContain("uploaded image");
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("does not clear rehostedUrl for uploaded images when prefix dir is missing", async () => {
    const repo = makeMockRepo({
      imageFile: { id: "card-001", originalUrl: null, rehostedUrl: "/some/url" },
    });
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("uploaded image");
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });

  it("counts readFile failures", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockImplementation(async () => ["card-001-orig.png"]);
    mockReadFile.mockRejectedValue(new Error("read error"));
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("read error");
  });

  it("handles non-Error thrown values", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockImplementation(async () => ["card-001-orig.png"]);
    mockReadFile.mockRejectedValue("raw-string-error");
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")]);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("raw-string-error");
  });

  it("with skipExisting only writes the variants missing from disk", async () => {
    const repo = makeMockRepo({});
    // 240w + full on disk, 120w + 400w missing — write only the two gaps.
    mockReaddir.mockImplementation(async () => [
      "card-001-orig.png",
      "card-001-240w.webp",
      "card-001-full.webp",
    ]);
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")], {
      skipExisting: true,
    });
    expect(result.regenerated).toBe(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("card-001-120w.webp"),
      expect.any(Buffer),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("card-001-400w.webp"),
      expect.any(Buffer),
    );
  });

  it("with skipExisting skips entirely when every variant exists", async () => {
    const repo = makeMockRepo({});
    mockReaddir.mockImplementation(async () => [
      "card-001-orig.png",
      "card-001-120w.webp",
      "card-001-240w.webp",
      "card-001-400w.webp",
      "card-001-full.webp",
    ]);
    const result = await regenerateImagesBatch(mockIo, repo, [snap("card-001")], {
      skipExisting: true,
    });
    expect(result.regenerated).toBe(1);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("uses per-image needsTrim from the settings map", async () => {
    const repo = makeMockRepo({});
    repo.getRotationsAndTrimByIds = vi.fn(() =>
      Promise.resolve(new Map([["card-trim", { rotation: 0, needsTrim: true }]])),
    );
    mockReaddir.mockImplementation(async () => ["card-trim-orig.png"]);
    await regenerateImagesBatch(mockIo, repo, [snap("card-trim")]);

    expect(mockSharpInstance.greyscale).toHaveBeenCalled();
  });

  it("skips the scan analysis when needsTrim is false in the settings map", async () => {
    const repo = makeMockRepo({});
    repo.getRotationsAndTrimByIds = vi.fn(() =>
      Promise.resolve(new Map([["card-keep", { rotation: 0, needsTrim: false }]])),
    );
    mockReaddir.mockImplementation(async () => ["card-keep-orig.png"]);
    await regenerateImagesBatch(mockIo, repo, [snap("card-keep")]);

    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
  });

  it("defaults to needsTrim=false when the settings map lacks an entry", async () => {
    // A row missing from the rotations/needsTrim map (e.g. raced delete) must
    // not retroactively start trimming; defaulting to false matches the
    // digital-image-default invariant.
    const repo = makeMockRepo({});
    repo.getRotationsAndTrimByIds = vi.fn(() => Promise.resolve(new Map()));
    mockReaddir.mockImplementation(async () => ["card-orphan-orig.png"]);
    await regenerateImagesBatch(mockIo, repo, [snap("card-orphan")]);

    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
  });
});

// Minimal in-memory job_runs repo good enough for runRegenerateImagesJob:
// tracks the current `result` JSONB. Tests can mutate the stored value
// directly via `setCancel` to simulate the cancel endpoint racing with the
// job loop.
function makeFakeJobRunsRepo(initial: unknown = null) {
  const state: { stored: unknown } = { stored: initial };
  const repo = {
    updateResult: vi.fn(async (_id: string, result: unknown) => {
      state.stored = result;
    }),
    mergeResult: vi.fn(async (_id: string, patch: object) => {
      const prior = (state.stored ?? {}) as Record<string, unknown>;
      const preserved = prior.cancelRequested === true;
      state.stored = { ...prior, ...(patch as Record<string, unknown>) };
      if (preserved) {
        (state.stored as Record<string, unknown>).cancelRequested = true;
      }
    }),
    getResult: vi.fn(async () => state.stored),
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    findRunning: vi.fn(),
    listRecent: vi.fn(),
    getLatestPerKind: vi.fn(),
    sweepOrphaned: vi.fn(),
    purgeOlderThan: vi.fn(),
    findLatestForResume: vi.fn(),
  };
  const current = () => state.stored;
  const setCancel = () => {
    if (state.stored && typeof state.stored === "object") {
      state.stored = { ...(state.stored as Record<string, unknown>), cancelRequested: true };
    }
  };
  return { repo: repo as any, current, setCancel };
}

const noopLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(() => noopLog),
} as any;

describe("runRegenerateImagesJob", () => {
  it("snapshots from listAllRehosted on a fresh start and processes everything", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => snap(`card-${String(i).padStart(3, "0")}`));
    const printingImages = makeMockRepo({ rehosted: ids });
    mockReaddir.mockImplementation(async () => ids.map((s) => `${s.imageId}-orig.png`));
    const fake = makeFakeJobRunsRepo();

    const result = await runRegenerateImagesJob(
      { io: mockIo, printingImages, jobRuns: fake.repo, log: noopLog },
      "run-1",
    );

    expect(result.totalFiles).toBe(12);
    expect(result.lastProcessedIndex).toBe(11);
    expect(result.processed).toBe(12);
    expect(result.regenerated).toBe(12);
    expect(result.failed).toBe(0);
    expect(result.resumedFromRunId).toBeNull();
    // The initial snapshot write; per-batch progress goes through mergeResult.
    expect(fake.repo.updateResult).toHaveBeenCalledTimes(1);
    // 12 / batch_size 10 = 2 batches.
    expect(fake.repo.mergeResult).toHaveBeenCalledTimes(2);
    // Default: whole catalog, not just scans.
    expect(printingImages.listAllRehosted).toHaveBeenCalledWith(false);
  });

  it("snapshots only scans when scansOnly is set", async () => {
    const ids = [snap("scan-001")];
    const printingImages = makeMockRepo({ rehosted: ids });
    mockReaddir.mockImplementation(async () => ids.map((s) => `${s.imageId}-orig.png`));
    const fake = makeFakeJobRunsRepo();

    const result = await runRegenerateImagesJob(
      { io: mockIo, printingImages, jobRuns: fake.repo, log: noopLog },
      "run-scans",
      { scansOnly: true },
    );

    expect(printingImages.listAllRehosted).toHaveBeenCalledWith(true);
    expect(result.totalFiles).toBe(1);
  });

  it("resumes from a prior checkpoint and skips already-processed entries", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => snap(`card-${String(i).padStart(3, "0")}`));
    const printingImages = makeMockRepo({ rehosted: [] });
    // Disk reads succeed for everything we DO process.
    mockReaddir.mockImplementation(async () => ids.map((s) => `${s.imageId}-orig.png`));
    const fake = makeFakeJobRunsRepo();

    const priorCheckpoint = {
      snapshot: ids,
      totalFiles: 12,
      lastProcessedIndex: 4,
      processed: 5,
      regenerated: 5,
      failed: 0,
      errors: [],
      resumedFromRunId: null,
      cancelRequested: false,
      skipExisting: false,
    };

    const result = await runRegenerateImagesJob(
      { io: mockIo, printingImages, jobRuns: fake.repo, log: noopLog },
      "run-2",
      { resumeFrom: { runId: "run-1", checkpoint: priorCheckpoint } },
    );

    expect(printingImages.listAllRehosted).not.toHaveBeenCalled();
    expect(result.lastProcessedIndex).toBe(11);
    expect(result.processed).toBe(12);
    // 5 already counted from prior + 7 from this run = 12.
    expect(result.regenerated).toBe(12);
    expect(result.resumedFromRunId).toBe("run-1");
    // Per-batch helper sees only the 7 unprocessed entries (settings fetched once).
    const settingsCallArgs = (printingImages.getRotationsAndTrimByIds as any).mock.calls[0][0];
    expect(settingsCallArgs).toHaveLength(7);
    expect(settingsCallArgs[0]).toBe("card-005");
  });

  it("stops mid-run and throws 'cancelled' when cancelRequested flips between batches", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => snap(`card-${String(i).padStart(3, "0")}`));
    const printingImages = makeMockRepo({ rehosted: ids });
    mockReaddir.mockImplementation(async () => ids.map((s) => `${s.imageId}-orig.png`));
    const fake = makeFakeJobRunsRepo();

    // The cancel-check happens after each batch's processing but before the
    // batch's progress is written. To stop after exactly one batch, trip the
    // cancel flag right after the initial snapshot write — by the time the
    // loop's first cancel-check runs, the row already has cancelRequested=true.
    let writes = 0;
    const realUpdate = fake.repo.updateResult.getMockImplementation()!;
    fake.repo.updateResult.mockImplementation(async (id: string, value: unknown) => {
      await realUpdate(id, value);
      writes++;
      if (writes === 1) {
        fake.setCancel();
      }
    });

    await expect(
      runRegenerateImagesJob(
        { io: mockIo, printingImages, jobRuns: fake.repo, log: noopLog },
        "run-cancel",
      ),
    ).rejects.toThrow("cancelled");

    const final = fake.current() as { processed: number; cancelRequested: boolean };
    // First batch (10) ran; cancel checked after; second batch did not start.
    expect(final.processed).toBe(10);
    expect(final.cancelRequested).toBe(true);
  });

  it("keeps a cancel that lands while a batch's progress write is in flight", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => snap(`card-${String(i).padStart(3, "0")}`));
    const printingImages = makeMockRepo({ rehosted: ids });
    mockReaddir.mockImplementation(async () => ids.map((s) => `${s.imageId}-orig.png`));
    const fake = makeFakeJobRunsRepo();

    // The cancel endpoint writes the flag just as the loop merges its first
    // batch's progress (which carries cancelRequested: false). The merge must
    // not drop the flag, so the loop stops before batch two.
    const realMerge = fake.repo.mergeResult.getMockImplementation()!;
    let merges = 0;
    fake.repo.mergeResult.mockImplementation(async (id: string, patch: object) => {
      merges++;
      if (merges === 1) {
        fake.setCancel();
      }
      await realMerge(id, patch);
    });

    await expect(
      runRegenerateImagesJob(
        { io: mockIo, printingImages, jobRuns: fake.repo, log: noopLog },
        "run-cancel-race",
      ),
    ).rejects.toThrow("cancelled");

    const final = fake.current() as { processed: number; cancelRequested: boolean };
    expect(final.processed).toBe(10);
    expect(final.cancelRequested).toBe(true);
  });

  it("isRegenerateImagesCheckpoint accepts the canonical shape and rejects partial values", () => {
    const ok = {
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
    };
    expect(isRegenerateImagesCheckpoint(ok)).toBe(true);
    expect(isRegenerateImagesCheckpoint(null)).toBe(false);
    expect(isRegenerateImagesCheckpoint({})).toBe(false);
    expect(isRegenerateImagesCheckpoint({ ...ok, snapshot: "not-an-array" })).toBe(false);
    expect(isRegenerateImagesCheckpoint({ ...ok, cancelRequested: "no" })).toBe(false);
  });
});
