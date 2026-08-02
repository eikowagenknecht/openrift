import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dirent,
  makeMockRepo,
  mockIo,
  mockReadFile,
  mockReaddir,
  mockStat,
  mockUnlink,
  resetImageMocks,
} from "../../test/image-mocks.js";
import {
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
} from "./maintenance.js";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetImageMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
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

  it("handles missing media/cards directory", async () => {
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
      selectResult: [{ setId: "s1", setName: "S1", total: 3, rehosted: 3 }],
    });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("s1", true)];
      }
      return ["card1-orig.png", "card1-full.webp", "card1-400w.webp"];
    });
    let statCall = 0;
    const sizes = [5000, 2000, 800];
    mockStat.mockImplementation(async () => ({ size: sizes[statCall++] }));

    const result = await getRehostStatus(mockIo, repo);
    expect(result.disk.byResolution).toEqual([
      { resolution: "orig", bytes: 5000, fileCount: 1 },
      { resolution: "full", bytes: 2000, fileCount: 1 },
      { resolution: "400w", bytes: 800, fileCount: 1 },
    ]);
  });

  it("labels legacy 300w files as 'other' (pre-sweep stragglers)", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "s1", setName: "S1", total: 1, rehosted: 1 }],
    });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("s1", true)];
      }
      return ["card1-300w.webp"];
    });
    mockStat.mockResolvedValue({ size: 500 });

    const result = await getRehostStatus(mockIo, repo);
    expect(result.disk.byResolution).toEqual([{ resolution: "other", bytes: 500, fileCount: 1 }]);
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

  it("counts duplicate -orig.* archives as orphaned (count - 1 per base)", async () => {
    const repo = makeMockRepo({
      selectResult: [{ setId: "s", setName: "Set", total: 1, rehosted: 1 }],
    });
    repo.allRehostedUrls = vi.fn(() =>
      Promise.resolve(["/media/cards/s1/img-1", "/media/cards/s1/img-2"]),
    );
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("s1", true)];
      }
      // img-1 has 2 orig (1 duplicate); img-2 has 3 orig (2 duplicates)
      return [
        "img-1-orig.png",
        "img-1-orig.webp",
        "img-2-orig.png",
        "img-2-orig.jpg",
        "img-2-orig.webp",
      ];
    });

    const result = await getRehostStatus(mockIo, repo);
    expect(result.orphanedFiles).toBe(3);
  });
});

describe("cleanupOrphanedFiles", () => {
  it("deletes files with no matching DB entry", async () => {
    const repo = {
      allRehostedUrls: vi.fn(async () => ["/media/cards/g1/img-1"]),
    } as any;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("g1", true)];
      }
      return ["img-1-full.webp", "orphan-full.webp"];
    });

    const result = await cleanupOrphanedFiles(mockIo, repo);

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("deletes stale duplicate -orig.* archives, keeping the newest by mtime", async () => {
    const repo = {
      allRehostedUrls: vi.fn(async () => ["/media/cards/g1/img-1"]),
    } as any;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("g1", true)];
      }
      return ["img-1-orig.png", "img-1-orig.webp", "img-1-400w.webp", "img-1-full.webp"];
    });
    // png is older, webp is newer → keep webp, delete png
    mockStat.mockImplementation(async (path: any) => {
      if (String(path).endsWith("img-1-orig.png")) {
        return { size: 1000, mtime: new Date("2024-01-01") };
      }
      if (String(path).endsWith("img-1-orig.webp")) {
        return { size: 1000, mtime: new Date("2024-06-01") };
      }
      return { size: 500, mtime: new Date("2024-06-01") };
    });

    const result = await cleanupOrphanedFiles(mockIo, repo);

    expect(result.deleted).toBe(1);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining("img-1-orig.png"));
    expect(mockUnlink).not.toHaveBeenCalledWith(expect.stringContaining("img-1-orig.webp"));
  });

  it("deletes files whose variant suffix is no longer in SIZES", async () => {
    const repo = {
      allRehostedUrls: vi.fn(async () => ["/media/cards/g1/img-1"]),
    } as any;
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("g1", true)];
      }
      // img-1 has a DB entry so its base matches, but -300w is no longer in SIZES
      // → treated as orphaned. -full and -orig remain valid.
      return ["img-1-300w.webp", "img-1-400w.webp", "img-1-full.webp", "img-1-orig.png"];
    });

    const result = await cleanupOrphanedFiles(mockIo, repo);

    expect(result.scanned).toBe(4);
    expect(result.deleted).toBe(1);
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining("img-1-300w.webp"));
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
  const sampleImage = {
    imageId: "img-1",
    rehostedUrl: "/media/cards/g1/img-1",
    originalUrl: "https://example.com/img.png",
    cardSlug: "c-1",
    cardName: "Card",
    printingShortCode: "p-1",
    setSlug: "set-a",
  };

  it("returns empty broken list when orig + all SIZES variants exist", async () => {
    const repo = { listAllRehostedWithContext: vi.fn(async () => [sampleImage]) } as any;
    mockReaddir.mockResolvedValue([
      "img-1-orig.png",
      "img-1-120w.webp",
      "img-1-240w.webp",
      "img-1-400w.webp",
      "img-1-full.webp",
    ]);

    const result = await findBrokenImages(mockIo, repo);

    expect(result.total).toBe(1);
    expect(result.broken).toHaveLength(0);
  });

  it("identifies broken images with no files on disk", async () => {
    const repo = { listAllRehostedWithContext: vi.fn(async () => [sampleImage]) } as any;
    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await findBrokenImages(mockIo, repo);

    expect(result.total).toBe(1);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0].imageId).toBe("img-1");
  });

  it("flags images missing the -orig archive (variants alone don't count)", async () => {
    const repo = { listAllRehostedWithContext: vi.fn(async () => [sampleImage]) } as any;
    mockReaddir.mockResolvedValue(["img-1-400w.webp", "img-1-full.webp"]);

    const result = await findBrokenImages(mockIo, repo);

    expect(result.broken).toHaveLength(1);
    expect(result.broken[0].imageId).toBe("img-1");
  });

  it("flags images missing any current SIZES variant", async () => {
    const repo = { listAllRehostedWithContext: vi.fn(async () => [sampleImage]) } as any;
    mockReaddir.mockResolvedValue(["img-1-orig.png", "img-1-400w.webp"]); // no -full.webp

    const result = await findBrokenImages(mockIo, repo);

    expect(result.broken).toHaveLength(1);
  });
});

describe("findLowResImages", () => {
  it("returns empty when all images have a large enough short edge", async () => {
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
          rehostedUrl: "/media/cards/g1/img-1",
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

  it("identifies portrait images with short edge below the threshold", async () => {
    // 300×500 portrait → short edge = 300 < 400 threshold
    const mockSharpMeta: any = {
      metadata: () => Promise.resolve({ width: 300, height: 500 }),
    };
    const customIo = {
      ...mockIo,
      sharp: (() => mockSharpMeta) as any,
    };

    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/media/cards/g1/img-1",
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
    expect(result.lowRes[0].width).toBe(300);
    expect(result.lowRes[0].height).toBe(500);
  });

  it("identifies landscape images with short edge (height) below the threshold", async () => {
    // 700×350 landscape → short edge = 350 < 400 threshold
    const mockSharpMeta: any = {
      metadata: () => Promise.resolve({ width: 700, height: 350 }),
    };
    const customIo = {
      ...mockIo,
      sharp: (() => mockSharpMeta) as any,
    };

    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/media/cards/g1/img-1",
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
    expect(result.lowRes[0].width).toBe(700);
    expect(result.lowRes[0].height).toBe(350);
  });

  it("skips images where file read fails", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    const repo = {
      listAllRehostedWithContext: vi.fn(async () => [
        {
          imageId: "img-1",
          rehostedUrl: "/media/cards/g1/img-1",
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
