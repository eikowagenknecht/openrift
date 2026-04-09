/* oxlint-disable
   import/no-nodejs-modules,
   no-empty-function,
   promise/prefer-await-to-then,
   unicorn/no-useless-undefined
   -- test file: mocks require Promise.resolve(), empty fns, and node imports */
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Io } from "../io.js";
// ─── Import module under test ───────────────────────────────────────────
import {
  CARD_IMAGES_DIR,
  cleanupOrphanedFiles,
  clearAllRehosted,
  deleteRehostFiles,
  downloadImage,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  imageRehostedUrl,
  processAndSave,
  regenerateImages,
  rehostFilesExist,
  rehostImages,
  rehostSingleImage,
} from "./image-rehost.js";

// ─── Mock fs functions (provided via io parameter) ──────────────────────
const mockMkdir = vi.fn(() => Promise.resolve(undefined as any));
const mockWriteFile = vi.fn(() => Promise.resolve(undefined as any));
const mockReadFile = vi.fn(() => Promise.resolve(Buffer.from("img")));
const mockReaddir = vi.fn((): Promise<any> => Promise.resolve([]));
const mockRename = vi.fn(() => Promise.resolve(undefined as any));
const mockUnlink = vi.fn(() => Promise.resolve(undefined as any));
const mockStat = vi.fn(() => Promise.resolve({ size: 1024 }));

const mockFetch = vi.fn(() =>
  Promise.resolve(
    new Response(Buffer.from("image-data"), { headers: { "content-type": "image/png" } }),
  ),
) as any;

// ─── sharp mock ──────────────────────────────────────────────────────────
const mockSharpInstance: any = {};
mockSharpInstance.resize = () => mockSharpInstance;
mockSharpInstance.webp = () => mockSharpInstance;
mockSharpInstance.toBuffer = () => Promise.resolve(Buffer.from("webp"));

const mockIo: Io = {
  fs: {
    mkdir: mockMkdir as any,
    readFile: mockReadFile as any,
    readdir: mockReaddir as any,
    rename: mockRename as any,
    stat: mockStat as any,
    unlink: mockUnlink as any,
    writeFile: mockWriteFile as any,
  },
  fetch: mockFetch,
  sharp: (() => mockSharpInstance) as any,
};

/**
 * Creates a mock PrintingImagesRepo for rehostImages/clearAllRehosted/getRehostStatus.
 * @returns Mock repo object.
 */
function makeMockRepo(opts: { selectResult?: any; updateResult?: any } = {}) {
  const updateRehostedUrlFn = vi.fn(() => Promise.resolve());
  return {
    listUnrehosted: vi.fn(() => Promise.resolve(opts.selectResult ?? [])),
    updateRehostedUrl: updateRehostedUrlFn,
    clearAllRehostedUrls: vi.fn(() => {
      const rows = opts.updateResult ?? [{ numUpdatedRows: 0n }];
      return Promise.resolve(Number(rows[0].numUpdatedRows));
    }),
    rehostStatusBySet: vi.fn(() => Promise.resolve(opts.selectResult ?? [])),
    allRehostedUrls: vi.fn(() => Promise.resolve([])),
  } as any;
}

// ─── Helpers ────────────────────────────────────────────────────────────
const dirent = (name: string, isDir: boolean) => ({ name, isDirectory: () => isDir });

// ─── Shared setup ───────────────────────────────────────────────────────
let consoleErrorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue();
  mockWriteFile.mockReset().mockResolvedValue();
  mockReadFile.mockReset().mockResolvedValue(Buffer.from("img"));
  mockReaddir.mockReset().mockResolvedValue([]);
  mockRename.mockReset().mockResolvedValue();
  mockUnlink.mockReset().mockResolvedValue();
  mockStat.mockReset().mockResolvedValue({ size: 1024 });
  mockFetch
    .mockReset()
    .mockResolvedValue(
      new Response(Buffer.from("image-data"), { headers: { "content-type": "image/png" } }),
    );

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("downloadImage", () => {
  it("returns buffer and extension from content-type", async () => {
    const cases = [
      { contentType: "image/png", expected: ".png" },
      { contentType: "image/jpeg", expected: ".jpg" },
      { contentType: "image/jpg", expected: ".jpg" },
      { contentType: "image/webp", expected: ".webp" },
      { contentType: "image/avif", expected: ".avif" },
    ];
    for (const { contentType, expected } of cases) {
      mockFetch.mockResolvedValueOnce(
        new Response(Buffer.from("d"), { headers: { "content-type": contentType } }),
      );
      const result = await downloadImage(mockIo, "https://example.com/img");
      expect(result.ext).toBe(expected);
      expect(result.buffer).toBeInstanceOf(Buffer);
    }
  });

  it("falls back to URL extension", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage(mockIo, "https://example.com/img.gif");
    expect(ext).toBe(".gif");
  });

  it("defaults to .png when no extension info", async () => {
    mockFetch.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage(mockIo, "https://example.com/image");
    expect(ext).toBe(".png");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(downloadImage(mockIo, "https://example.com/x")).rejects.toThrow(
      "Download failed (404)",
    );
  });

  it("handles content-type with extra params (charset)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(Buffer.from("d"), { headers: { "content-type": "image/png; charset=utf-8" } }),
    );
    const { ext } = await downloadImage(mockIo, "https://example.com/img");
    expect(ext).toBe(".png");
  });

  it("throws on 500 server error", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(downloadImage(mockIo, "https://example.com/x")).rejects.toThrow(
      "Download failed (500)",
    );
  });
});

describe("rehostFilesExist", () => {
  it("returns true when matching files exist", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-300w.webp"]);
    expect(await rehostFilesExist(mockIo, "/tmp/out", "card-001")).toBe(true);
  });

  it("returns false when no matching files exist", async () => {
    mockReaddir.mockResolvedValue(["other-file.webp"]);
    expect(await rehostFilesExist(mockIo, "/tmp/out", "card-001")).toBe(false);
  });

  it("returns false when directory does not exist", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    expect(await rehostFilesExist(mockIo, "/tmp/out", "card-001")).toBe(false);
  });
});

describe("processAndSave", () => {
  it("writes original and 3 webp variants", async () => {
    const buf = Buffer.from("test-img");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001");

    // mkdir: once in processAndSave, once in generateWebpVariants
    expect(mockMkdir).toHaveBeenCalledTimes(2);
    // 1 orig + 3 webp
    expect(mockWriteFile).toHaveBeenCalledTimes(4);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-orig.png", buf);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-300w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-400w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-full.webp", expect.any(Buffer));
  });

  it("throws when files already exist on disk", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-300w.webp"]);
    const buf = Buffer.from("test-img");
    await expect(processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001")).rejects.toThrow(
      "Rehost files already exist for card-001",
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("allows overwrite when allowOverwrite is true", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png"]);
    const buf = Buffer.from("test-img");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", true);
    expect(mockWriteFile).toHaveBeenCalledTimes(4);
  });
});

describe("deleteRehostFiles", () => {
  it("deletes matching files only", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-300w.webp", "other.webp"]);
    await deleteRehostFiles(mockIo, "/card-images/set1/card-001");

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_IMAGES_DIR, "set1", "card-001-orig.png"));
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_IMAGES_DIR, "set1", "card-001-300w.webp"));
  });

  it("handles missing directory", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    await deleteRehostFiles(mockIo, "/card-images/set1/card-001");
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("swallows unlink errors", async () => {
    mockReaddir.mockResolvedValue(["base-orig.png"]);
    mockUnlink.mockRejectedValue(new Error("EPERM"));
    await deleteRehostFiles(mockIo, "/card-images/set1/base"); // should not throw
  });
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

describe("regenerateImages", () => {
  it("returns empty when card-images dir missing", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await regenerateImages(mockIo, 0);
    expect(result).toEqual({
      total: 0,
      regenerated: 0,
      failed: 0,
      errors: [],
      hasMore: false,
      totalFiles: 0,
    });
  });

  it("handles no orig files", async () => {
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return ["card-300w.webp"]; // no -orig. files
    });
    const result = await regenerateImages(mockIo, 0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it("regenerates variants from orig files", async () => {
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true), dirent(".gitkeep", false)];
      }
      return ["card-001-orig.png", "card-002-orig.jpg"];
    });
    const result = await regenerateImages(mockIo, 0);
    expect(result.regenerated).toBe(2);
    expect(result.totalFiles).toBe(2);
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });

  it("sets hasMore when exceeding batch size", async () => {
    const files = Array.from({ length: 15 }, (_, i) => `card-${i}-orig.png`);
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return files;
    });
    const result = await regenerateImages(mockIo, 0);
    expect(result.totalFiles).toBe(15);
    expect(result.total).toBe(10);
    expect(result.hasMore).toBe(true);
    expect(result.regenerated).toBe(10);
  });

  it("counts readFile failures", async () => {
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return ["card-001-orig.png"];
    });
    mockReadFile.mockRejectedValue(new Error("read error"));
    const result = await regenerateImages(mockIo, 0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("read error");
  });

  it("paginates with offset > 0", async () => {
    const files = Array.from({ length: 15 }, (_, i) => `card-${i}-orig.png`);
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return files;
    });
    const result = await regenerateImages(mockIo, 10);
    expect(result.totalFiles).toBe(15);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(false);
    expect(result.regenerated).toBe(5);
  });

  it("handles non-Error thrown values in regeneration", async () => {
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return ["card-001-orig.png"];
    });
    mockReadFile.mockRejectedValue("raw-string-error");
    const result = await regenerateImages(mockIo, 0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("raw-string-error");
  });

  it("collects orig files across multiple set directories", async () => {
    let callIndex = 0;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("alpha", true), dirent("beta", true)];
      }
      callIndex++;
      // alpha has 1 orig, beta has 1 orig
      return callIndex === 1 ? ["card-a-orig.png"] : ["card-b-orig.jpg"];
    });
    const result = await regenerateImages(mockIo, 0);
    expect(result.totalFiles).toBe(2);
    expect(result.regenerated).toBe(2);
    expect(mockReadFile).toHaveBeenCalledTimes(2);
  });
});

describe("clearAllRehosted", () => {
  it("clears DB and deletes files", async () => {
    const repo = makeMockRepo({ updateResult: [{ numUpdatedRows: 5n }] });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true), dirent(".gitkeep", false)];
      }
      return ["card-orig.png", "card-300w.webp"];
    });

    const result = await clearAllRehosted(mockIo, repo);
    expect(result).toEqual({ cleared: 5 });
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("handles missing card-images directory", async () => {
    const repo = makeMockRepo({ updateResult: [{ numUpdatedRows: 3n }] });
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await clearAllRehosted(mockIo, repo);
    expect(result).toEqual({ cleared: 3 });
  });

  it("deletes across multiple set directories", async () => {
    const repo = makeMockRepo({ updateResult: [{ numUpdatedRows: 10n }] });
    let setCall = 0;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true), dirent("set2", true)];
      }
      setCall++;
      return setCall === 1 ? ["f1.webp", "f2.webp"] : ["f3.webp"];
    });

    const result = await clearAllRehosted(mockIo, repo);
    expect(result).toEqual({ cleared: 10 });
    expect(mockUnlink).toHaveBeenCalledTimes(3);
  });
});

describe("getRehostStatus", () => {
  it("returns aggregated stats with disk info", async () => {
    const repo = makeMockRepo({
      selectResult: [
        { setId: "set1", setName: "Set One", total: 10, rehosted: 6 },
        { setId: "set2", setName: "Set Two", total: 5, rehosted: 2 },
      ],
    });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true)];
      }
      return ["f1.webp", "f2.webp"];
    });

    const result = await getRehostStatus(mockIo, repo);
    expect(result.total).toBe(15);
    expect(result.rehosted).toBe(8);
    expect(result.external).toBe(7);
    expect(result.sets).toHaveLength(2);
    expect(result.disk.totalBytes).toBe(2048);
    expect(result.disk.byResolution).toEqual([{ resolution: "other", bytes: 2048, fileCount: 2 }]);
    expect(result.disk.sets).toEqual([{ setId: "set1", bytes: 2048, fileCount: 2 }]);
  });

  it("handles empty database", async () => {
    const repo = makeMockRepo();
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await getRehostStatus(mockIo, repo);
    expect(result).toEqual({
      total: 0,
      rehosted: 0,
      external: 0,
      orphanedFiles: 0,
      sets: [],
      disk: { totalBytes: 0, byResolution: [], sets: [] },
    });
  });

  it("skips non-directory entries in disk scan", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "set1", setName: "Set One", total: 2, rehosted: 1 }],
    });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true), dirent(".gitkeep", false)];
      }
      return ["f1.webp"];
    });

    const result = await getRehostStatus(mockIo, repo);
    // Only set1 should appear in disk stats — .gitkeep skipped via continue
    expect(result.disk.sets).toHaveLength(1);
    expect(result.disk.sets[0].setId).toBe("set1");
  });

  it("computes disk stats across multiple set directories", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "s1", setName: "S1", total: 3, rehosted: 3 }],
    });
    let dirCall = 0;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set-a", true), dirent("set-b", true)];
      }
      dirCall++;
      return dirCall === 1 ? ["a1.webp", "a2.webp"] : ["b1.webp"];
    });
    mockStat.mockResolvedValue({ size: 500 });

    const result = await getRehostStatus(mockIo, repo);
    expect(result.disk.totalBytes).toBe(1500);
    expect(result.disk.byResolution).toEqual([{ resolution: "other", bytes: 1500, fileCount: 3 }]);
    expect(result.disk.sets).toEqual([
      { setId: "set-a", bytes: 1000, fileCount: 2 },
      { setId: "set-b", bytes: 500, fileCount: 1 },
    ]);
  });

  it("breaks down disk usage by resolution", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "s1", setName: "S1", total: 4, rehosted: 4 }],
    });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("s1", true)];
      }
      return ["card1-orig.png", "card1-full.webp", "card1-300w.webp", "card1-400w.webp"];
    });
    let statCall = 0;
    const sizes = [5000, 2000, 500, 800];
    mockStat.mockImplementation(async () => ({ size: sizes[statCall++] }));

    const result = await getRehostStatus(mockIo, repo);
    expect(result.disk.byResolution).toEqual([
      { resolution: "orig", bytes: 5000, fileCount: 1 },
      { resolution: "full", bytes: 2000, fileCount: 1 },
      { resolution: "400w", bytes: 800, fileCount: 1 },
      { resolution: "300w", bytes: 500, fileCount: 1 },
    ]);
  });

  it("correctly computes external = total - rehosted per set", async () => {
    const repo = makeMockRepo({
      selectResult: [
        { setId: "a", setName: "Alpha", total: 10, rehosted: 3 },
        { setId: "b", setName: "Beta", total: 5, rehosted: 5 },
      ],
    });
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await getRehostStatus(mockIo, repo);
    expect(result.sets[0]).toEqual({
      setId: "a",
      setName: "Alpha",
      total: 10,
      rehosted: 3,
      external: 7,
    });
    expect(result.sets[1]).toEqual({
      setId: "b",
      setName: "Beta",
      total: 5,
      rehosted: 5,
      external: 0,
    });
    expect(result.total).toBe(15);
    expect(result.rehosted).toBe(8);
    expect(result.external).toBe(7);
  });

  it("counts orphaned files on disk with no matching DB entry", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "s", setName: "Set", total: 1, rehosted: 1 }],
    });
    // allRehostedUrls returns empty → every disk file is orphaned
    repo.allRehostedUrls = vi.fn(() => Promise.resolve([]));
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("s1", true)];
      }
      return ["img-001-300w.webp", "img-002-full.webp"];
    });

    const result = await getRehostStatus(mockIo, repo);
    expect(result.orphanedFiles).toBe(2);
  });
});

describe("imageRehostedUrl", () => {
  it("builds the canonical rehosted URL using last 2 chars of UUID", () => {
    expect(imageRehostedUrl("00594247-a18a-4efd-8998-105449a4cf40")).toBe(
      "/card-images/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });
});

describe("rehostSingleImage", () => {
  it("does nothing when image has no originalUrl", async () => {
    const repo = {
      getForRehost: vi.fn(async () => ({ originalUrl: null, imageFileId: "if-1" })),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    await rehostSingleImage(mockIo, repo, "img-1");

    expect(mockFetch).not.toHaveBeenCalled();
    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });

  it("does nothing when image is not found", async () => {
    const repo = {
      getForRehost: vi.fn(async () => null),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    await rehostSingleImage(mockIo, repo, "img-1");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("downloads, processes, and updates the rehosted URL", async () => {
    const repo = {
      getForRehost: vi.fn(async () => ({
        originalUrl: "https://example.com/img.png",
        imageFileId: "00594247-a18a-4efd-8998-105449a4cf40",
      })),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(mockFetch).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4cf40",
      "/card-images/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });

  it("swallows download errors silently", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    const repo = {
      getForRehost: vi.fn(async () => ({
        originalUrl: "https://example.com/img.png",
        imageFileId: "00594247-a18a-4efd-8998-105449a4cf40",
      })),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    // Should not throw
    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(repo.updateRehostedUrl).not.toHaveBeenCalled();
  });
});

describe("cleanupOrphanedFiles", () => {
  it("deletes files with no matching DB entry", async () => {
    const repo = {
      allRehostedUrls: vi.fn(async () => ["/card-images/g1/img-1"]),
    } as any;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("g1", true)];
      }
      return ["img-1-300w.webp", "orphan-300w.webp"];
    });

    const result = await cleanupOrphanedFiles(mockIo, repo);

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("reports unlink errors", async () => {
    const repo = {
      allRehostedUrls: vi.fn(async () => []),
    } as any;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("g1", true)];
      }
      return ["orphan-300w.webp"];
    });
    mockUnlink.mockRejectedValue(new Error("EPERM"));

    const result = await cleanupOrphanedFiles(mockIo, repo);

    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});

describe("findBrokenImages", () => {
  it("returns empty broken list when all files exist", async () => {
    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/card-images/g1/img-1",
          originalUrl: "https://example.com/img.png",
          cardSlug: "c-1",
          cardName: "Card",
          printingShortCode: "p-1",
          setSlug: "set-a",
        },
      ]),
    } as any;
    mockReaddir.mockResolvedValue(["img-1-orig.png"]);

    const result = await findBrokenImages(mockIo, repo);

    expect(result.total).toBe(1);
    expect(result.broken).toHaveLength(0);
  });

  it("identifies broken images with no files on disk", async () => {
    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/card-images/g1/img-1",
          originalUrl: "https://example.com/img.png",
          cardSlug: "c-1",
          cardName: "Card",
          printingShortCode: "p-1",
          setSlug: "set-a",
        },
      ]),
    } as any;
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await findBrokenImages(mockIo, repo);

    expect(result.total).toBe(1);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0].imageId).toBe("img-1");
  });
});

describe("findLowResImages", () => {
  it("returns empty when all images are high-res", async () => {
    const mockSharpMeta: any = {
      metadata: () => Promise.resolve({ width: 800, height: 1200 }),
    };
    const customIo = {
      ...mockIo,
      sharp: (() => mockSharpMeta) as any,
    };

    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/card-images/g1/img-1",
          originalUrl: "https://example.com/img.png",
          cardSlug: "c-1",
          cardName: "Card",
          printingShortCode: "p-1",
          setSlug: "set-a",
        },
      ]),
    } as any;

    const result = await findLowResImages(customIo, repo);

    expect(result.total).toBe(1);
    expect(result.lowRes).toHaveLength(0);
  });

  it("identifies images below the width threshold", async () => {
    const mockSharpMeta: any = {
      metadata: () => Promise.resolve({ width: 400, height: 600 }),
    };
    const customIo = {
      ...mockIo,
      sharp: (() => mockSharpMeta) as any,
    };

    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/card-images/g1/img-1",
          originalUrl: "https://example.com/img.png",
          cardSlug: "c-1",
          cardName: "Card",
          printingShortCode: "p-1",
          setSlug: "set-a",
        },
      ]),
    } as any;

    const result = await findLowResImages(customIo, repo);

    expect(result.total).toBe(1);
    expect(result.lowRes).toHaveLength(1);
    expect(result.lowRes[0].width).toBe(400);
  });

  it("skips images where file read fails", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/card-images/g1/img-1",
          originalUrl: "https://example.com/img.png",
          cardSlug: "c-1",
          cardName: "Card",
          printingShortCode: "p-1",
          setSlug: "set-a",
        },
      ]),
    } as any;

    const result = await findLowResImages(mockIo, repo);

    expect(result.total).toBe(1);
    expect(result.lowRes).toHaveLength(0);
  });
});
