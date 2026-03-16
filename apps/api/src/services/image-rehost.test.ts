/* oxlint-disable
   import/no-nodejs-modules,
   no-empty-function,
   promise/prefer-await-to-then,
   unicorn/no-useless-undefined
   -- test file: mocks require Promise.resolve(), empty fns, and node imports */
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { join } from "node:path";

// ─── fs/promises mocks (must be declared before importing the module under test) ──
const mockMkdir = mock(() => Promise.resolve(undefined as any));
const mockWriteFile = mock(() => Promise.resolve(undefined as any));
const mockReadFile = mock(() => Promise.resolve(Buffer.from("img")));
const mockReaddir = mock((): Promise<any> => Promise.resolve([]));
const mockRename = mock(() => Promise.resolve(undefined as any));
const mockUnlink = mock(() => Promise.resolve(undefined as any));
const mockStat = mock(() => Promise.resolve({ size: 1024 }));

mock.module("node:fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  readdir: mockReaddir,
  rename: mockRename,
  unlink: mockUnlink,
  stat: mockStat,
}));

// ─── sharp mock ─────────────────────────────────────────────────────────
const mockSharpInstance: any = {};
mockSharpInstance.resize = () => mockSharpInstance;
mockSharpInstance.webp = () => mockSharpInstance;
mockSharpInstance.toBuffer = () => Promise.resolve(Buffer.from("webp"));

mock.module("sharp", () => ({ default: () => mockSharpInstance }));

// ─── Import module under test ───────────────────────────────────────────
// oxlint-disable-next-line import/first -- mocks must come before imports
import {
  CARD_IMAGES_DIR,
  clearAllRehosted,
  deleteRehostFiles,
  downloadImage,
  getRehostStatus,
  printingIdToFileBase,
  processAndSave,
  regenerateImages,
  rehostImages,
  renameRehostFiles,
} from "./image-rehost.js";

// ─── Kysely chain mock ─────────────────────────────────────────────────
// Proxy that makes every property access and function call chainable.
// Calls any function/array-of-function args so callback-based Kysely
// builders (leftJoin, select, filterWhere) execute their inline callbacks.
const IS_CHAIN = Symbol("isChain");

function isRealFn(x: unknown): x is (...args: any[]) => any {
  return typeof x === "function" && !(x as any)[IS_CHAIN];
}

function makeChain(value: any): any {
  const handler: ProxyHandler<any> = {
    get(_, prop) {
      if (prop === IS_CHAIN) {
        return true;
      }
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined;
      }
      if (prop === "execute") {
        return () => Promise.resolve(value);
      }
      return makeChain(value);
    },
    apply(_, __, args) {
      for (const arg of args) {
        if (isRealFn(arg)) {
          arg(makeChain(value));
        } else if (Array.isArray(arg)) {
          for (const item of arg) {
            if (isRealFn(item)) {
              item(makeChain(value));
            }
          }
        }
      }
      return makeChain(value);
    },
  };
  // Use a function target so the proxy is callable
  return new Proxy(function noop() {}, handler);
}

function makeMockDb(opts: { selectResult?: any; updateResult?: any } = {}) {
  return {
    selectFrom: () => makeChain(opts.selectResult ?? []),
    updateTable: () => makeChain(opts.updateResult ?? [{ numUpdatedRows: 0n }]),
  } as any;
}

// ─── Helpers ────────────────────────────────────────────────────────────
const dirent = (name: string, isDir: boolean) => ({ name, isDirectory: () => isDir });

// ─── Shared setup ───────────────────────────────────────────────────────
let consoleErrorSpy: ReturnType<typeof spyOn>;
let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  mockMkdir.mockReset().mockResolvedValue();
  mockWriteFile.mockReset().mockResolvedValue();
  mockReadFile.mockReset().mockResolvedValue(Buffer.from("img"));
  mockReaddir.mockReset().mockResolvedValue([]);
  mockRename.mockReset().mockResolvedValue();
  mockUnlink.mockReset().mockResolvedValue();
  mockStat.mockReset().mockResolvedValue({ size: 1024 });

  consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(Buffer.from("image-data"), { headers: { "content-type": "image/png" } }),
  );
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  fetchSpy.mockRestore();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("printingIdToFileBase", () => {
  it("converts with promo flag", () => {
    expect(printingIdToFileBase("SET-001:common:normal:promo")).toBe("SET-001-common-normal-y");
  });

  it("converts without promo (empty string)", () => {
    expect(printingIdToFileBase("SET-001:rare:foil:")).toBe("SET-001-rare-foil-n");
  });

  it("converts without promo (missing segment)", () => {
    expect(printingIdToFileBase("SET-001:mythic:normal")).toBe("SET-001-mythic-normal-n");
  });
});

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
      fetchSpy.mockResolvedValueOnce(
        new Response(Buffer.from("d"), { headers: { "content-type": contentType } }),
      );
      const result = await downloadImage("https://example.com/img");
      expect(result.ext).toBe(expected);
      expect(result.buffer).toBeInstanceOf(Buffer);
    }
  });

  it("falls back to URL extension", async () => {
    fetchSpy.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage("https://example.com/img.gif");
    expect(ext).toBe(".gif");
  });

  it("defaults to .png when no extension info", async () => {
    fetchSpy.mockResolvedValue(new Response(Buffer.from("d")));
    const { ext } = await downloadImage("https://example.com/image");
    expect(ext).toBe(".png");
  });

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(downloadImage("https://example.com/x")).rejects.toThrow("Download failed (404)");
  });
});

describe("processAndSave", () => {
  it("writes original and 3 webp variants", async () => {
    const buf = Buffer.from("test-img");
    await processAndSave(buf, ".png", "/tmp/out", "card-001");

    // mkdir: once in processAndSave, once in generateWebpVariants
    expect(mockMkdir).toHaveBeenCalledTimes(2);
    // 1 orig + 3 webp
    expect(mockWriteFile).toHaveBeenCalledTimes(4);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-orig.png", buf);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-300w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-400w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-full.webp", expect.any(Buffer));
  });
});

describe("deleteRehostFiles", () => {
  it("deletes matching files only", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-300w.webp", "other.webp"]);
    await deleteRehostFiles("/card-images/set1/card-001");

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_IMAGES_DIR, "set1", "card-001-orig.png"));
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_IMAGES_DIR, "set1", "card-001-300w.webp"));
  });

  it("handles missing directory", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    await deleteRehostFiles("/card-images/set1/card-001");
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("swallows unlink errors", async () => {
    mockReaddir.mockResolvedValue(["base-orig.png"]);
    mockUnlink.mockRejectedValue(new Error("EPERM"));
    await deleteRehostFiles("/card-images/set1/base"); // should not throw
  });
});

describe("renameRehostFiles", () => {
  it("renames matching files", async () => {
    mockReaddir.mockResolvedValue(["old-orig.png", "old-300w.webp", "other.webp"]);
    await renameRehostFiles("/card-images/set1/old", "/card-images/set1/new");

    const dir = join(CARD_IMAGES_DIR, "set1");
    expect(mockRename).toHaveBeenCalledTimes(2);
    expect(mockRename).toHaveBeenCalledWith(join(dir, "old-orig.png"), join(dir, "new-orig.png"));
    expect(mockRename).toHaveBeenCalledWith(join(dir, "old-300w.webp"), join(dir, "new-300w.webp"));
  });

  it("handles missing directory", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    await renameRehostFiles("/card-images/set1/old", "/card-images/set1/new");
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("swallows rename errors", async () => {
    mockReaddir.mockResolvedValue(["old-orig.png"]);
    mockRename.mockRejectedValue(new Error("EPERM"));
    await renameRehostFiles("/card-images/set1/old", "/card-images/set1/new"); // no throw
  });
});

describe("rehostImages", () => {
  it("returns zeros when no images found", async () => {
    const result = await rehostImages(makeMockDb());
    expect(result).toEqual({ total: 0, rehosted: 0, skipped: 0, failed: 0, errors: [] });
  });

  it("rehosts an image", async () => {
    const db = makeMockDb({
      selectResult: [
        {
          imageId: 1,
          printingSlug: "SET-001:common:normal:",
          originalUrl: "https://example.com/img.png",
          setSlug: "set1",
        },
      ],
      updateResult: [{ numUpdatedRows: 1n }],
    });

    const result = await rehostImages(db);
    expect(result).toEqual({ total: 1, rehosted: 1, skipped: 0, failed: 0, errors: [] });
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/img.png");
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("skips null originalUrl", async () => {
    const db = makeMockDb({
      selectResult: [{ imageId: 1, printingSlug: "X:a:b:", originalUrl: null, setSlug: "s" }],
    });
    const result = await rehostImages(db);
    expect(result.skipped).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("counts download failures", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));
    const db = makeMockDb({
      selectResult: [
        { imageId: 1, printingSlug: "X:a:b:", originalUrl: "https://x.com/img", setSlug: "s" },
      ],
    });
    const result = await rehostImages(db);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Network error");
  });

  it("handles non-Error thrown values", async () => {
    fetchSpy.mockRejectedValue("string-error");
    const db = makeMockDb({
      selectResult: [
        { imageId: 1, printingSlug: "X:a:b:", originalUrl: "https://x.com/img", setSlug: "s" },
      ],
    });
    const result = await rehostImages(db);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("string-error");
  });
});

describe("regenerateImages", () => {
  it("returns empty when card-images dir missing", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await regenerateImages(0);
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
    const result = await regenerateImages(0);
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
    const result = await regenerateImages(0);
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
    const result = await regenerateImages(0);
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
    const result = await regenerateImages(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("read error");
  });
});

describe("clearAllRehosted", () => {
  it("clears DB and deletes files", async () => {
    const db = makeMockDb({ updateResult: [{ numUpdatedRows: 5n }] });
    mockReaddir.mockImplementation(async (_dir: any, opts?: any) => {
      if (opts?.withFileTypes) {
        return [dirent("set1", true), dirent(".gitkeep", false)];
      }
      return ["card-orig.png", "card-300w.webp"];
    });

    const result = await clearAllRehosted(db);
    expect(result).toEqual({ cleared: 5 });
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("handles missing card-images directory", async () => {
    const db = makeMockDb({ updateResult: [{ numUpdatedRows: 3n }] });
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await clearAllRehosted(db);
    expect(result).toEqual({ cleared: 3 });
  });
});

describe("getRehostStatus", () => {
  it("returns aggregated stats with disk info", async () => {
    const db = makeMockDb({
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

    const result = await getRehostStatus(db);
    expect(result.total).toBe(15);
    expect(result.rehosted).toBe(8);
    expect(result.external).toBe(7);
    expect(result.sets).toHaveLength(2);
    expect(result.disk.totalBytes).toBe(2048);
    expect(result.disk.sets).toEqual([{ setId: "set1", bytes: 2048, fileCount: 2 }]);
  });

  it("handles empty database", async () => {
    const db = makeMockDb();
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    const result = await getRehostStatus(db);
    expect(result).toEqual({
      total: 0,
      rehosted: 0,
      external: 0,
      sets: [],
      disk: { totalBytes: 0, sets: [] },
    });
  });
});
