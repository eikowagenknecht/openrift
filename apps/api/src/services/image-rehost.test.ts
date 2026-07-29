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
  CARD_MEDIA_DIR,
  cleanupOrphanedFiles,
  clearAllRehosted,
  computeScanCropBox,
  computeScanLevels,
  deleteRehostFiles,
  downloadImage,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  imageRehostedUrl,
  isPrivateIp,
  isRegenerateCheckpoint,
  processAndSave,
  regenerateImagesBatch,
  rehostFilesExist,
  rehostImages,
  rehostSingleImage,
  runRegenerateImagesJob,
  unrehostImages,
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
// Default: portrait source (width < height). Individual tests can pass a
// custom `sharp` via `customIo` to simulate landscape or specific metadata.
let mockSharpMetadata: { width: number; height: number } = { width: 600, height: 850 };
// When non-null, `toBuffer({ resolveWithObject: true })` returns this as the
// greyscale-analysis buffer for the scan path. Leave null to return a tiny
// buffer that fails the dimension guards (analysis becomes a no-op).
let mockGreyData: Buffer | null = null;
let mockRotation = 0;
const mockSharpInstance: any = {};
mockSharpInstance.resize = vi.fn(() => mockSharpInstance);
mockSharpInstance.rotate = vi.fn((r: number) => {
  mockRotation = r;
  return mockSharpInstance;
});
mockSharpInstance.clone = vi.fn(() => mockSharpInstance);
mockSharpInstance.greyscale = vi.fn(() => mockSharpInstance);
mockSharpInstance.raw = vi.fn(() => mockSharpInstance);
mockSharpInstance.linear = vi.fn(() => mockSharpInstance);
mockSharpInstance.extract = vi.fn(() => mockSharpInstance);
mockSharpInstance.webp = () => mockSharpInstance;
mockSharpInstance.toBuffer = (opts?: { resolveWithObject?: boolean }) => {
  if (opts?.resolveWithObject) {
    const swap = mockRotation === 90 || mockRotation === 270;
    const info = {
      width: swap ? mockSharpMetadata.height : mockSharpMetadata.width,
      height: swap ? mockSharpMetadata.width : mockSharpMetadata.height,
    };
    return Promise.resolve({ data: mockGreyData ?? Buffer.from("grey"), info });
  }
  return Promise.resolve(Buffer.from("webp"));
};
mockSharpInstance.metadata = () => Promise.resolve(mockSharpMetadata);

/**
 * Build a synthetic greyscale scan: white background with an optional darker
 * rectangle (the "card") of the given luminance value.
 * @returns Raw single-channel buffer of `width * height` pixels.
 */
function greyScan(
  width: number,
  height: number,
  card?: { left: number; top: number; width: number; height: number },
  value = 30,
): Buffer {
  const buf = Buffer.alloc(width * height, 255);
  if (card) {
    for (let y = card.top; y < card.top + card.height; y++) {
      for (let x = card.left; x < card.left + card.width; x++) {
        buf[y * width + x] = value;
      }
    }
  }
  return buf;
}

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
  // Public documentation-range address so the SSRF guard passes for the fake
  // hosts these tests use; individual tests override to simulate private IPs.
  dnsLookupAll: vi.fn(async () => [{ address: "203.0.113.10" }]),
};

/**
 * Creates a mock PrintingImagesRepo for rehostImages/clearAllRehosted/getRehostStatus.
 * @returns Mock repo object.
 */
function makeMockRepo(
  opts: {
    selectResult?: any;
    updateResult?: any;
    rehosted?: { imageId: string }[];
    /** When set, getImageFileById returns this row regardless of id. Default
     *  returns a row with both URLs set so existing tests keep their
     *  "rehosted url cleared" behavior. */
    imageFile?: { id: string; originalUrl: string | null; rehostedUrl: string | null } | null;
  } = {},
) {
  const updateRehostedUrlFn = vi.fn(() => Promise.resolve());
  const defaultFile = { id: "default", originalUrl: "https://x.test/a.png", rehostedUrl: null };
  return {
    listUnrehosted: vi.fn(() => Promise.resolve(opts.selectResult ?? [])),
    updateRehostedUrl: updateRehostedUrlFn,
    clearAllRehostedUrls: vi.fn(() => {
      const rows = opts.updateResult ?? [{ numUpdatedRows: 0n }];
      return Promise.resolve(Number(rows[0].numUpdatedRows));
    }),
    rehostStatusBySet: vi.fn(() => Promise.resolve(opts.selectResult ?? [])),
    allRehostedUrls: vi.fn(() => Promise.resolve([])),
    getRotationsAndTrimByIds: vi.fn(() => Promise.resolve(new Map())),
    listAllRehosted: vi.fn(() => Promise.resolve(opts.rehosted ?? [])),
    getImageFileById: vi.fn(() =>
      Promise.resolve(opts.imageFile === undefined ? defaultFile : opts.imageFile),
    ),
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
  mockSharpInstance.resize.mockClear();
  mockSharpInstance.rotate.mockClear();
  mockSharpInstance.clone.mockClear();
  mockSharpInstance.greyscale.mockClear();
  mockSharpInstance.raw.mockClear();
  mockSharpInstance.linear.mockClear();
  mockSharpInstance.extract.mockClear();
  mockSharpMetadata = { width: 600, height: 850 };
  mockGreyData = null;
  mockRotation = 0;
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

  it("blocks hosts that resolve to a private address", async () => {
    const io = { ...mockIo, dnsLookupAll: async () => [{ address: "10.0.0.5" }] };
    await expect(downloadImage(io, "https://internal.example/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks hosts where any resolved address is private", async () => {
    // DNS round-robin mixing a public and a private address must still block.
    const io = {
      ...mockIo,
      dnsLookupAll: async () => [{ address: "203.0.113.10" }, { address: "127.0.0.1" }],
    };
    await expect(downloadImage(io, "https://mixed.example/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
  });

  it("blocks private IP literals without a DNS lookup", async () => {
    const lookupSpy = vi.fn();
    const io = { ...mockIo, dnsLookupAll: lookupSpy };
    await expect(downloadImage(io, "https://169.254.169.254/meta")).rejects.toThrow(
      "Blocked download (private address)",
    );
    await expect(downloadImage(io, "https://[::1]/x")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(downloadImage(mockIo, "file:///etc/passwd")).rejects.toThrow(
      "Blocked download (unsupported protocol",
    );
  });

  it("re-checks every redirect hop and blocks redirects to private addresses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://127.0.0.1/steal" } }),
    );
    await expect(downloadImage(mockIo, "https://public.example/img")).rejects.toThrow(
      "Blocked download (private address)",
    );
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("follows public redirects and returns the target's body", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://cdn.example/real.png" } }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("img"), { headers: { "content-type": "image/png" } }),
      );
    const { ext } = await downloadImage(mockIo, "https://public.example/img");
    expect(ext).toBe(".png");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after too many redirects", async () => {
    mockFetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://public.example/loop" } }),
    );
    await expect(downloadImage(mockIo, "https://public.example/img")).rejects.toThrow(
      "too many redirects",
    );
  });
});

describe("isPrivateIp", () => {
  it("flags loopback, private, link-local, CGNAT, and multicast ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "fe80::1%eth0",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("passes public addresses", () => {
    for (const ip of ["203.0.113.10", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "1.1.1.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
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
  it("writes original and 4 webp variants", async () => {
    const buf = Buffer.from("test-img");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false);

    // mkdir: once in processAndSave, once in generateWebpVariants
    expect(mockMkdir).toHaveBeenCalledTimes(2);
    // 1 orig + 4 webp (120w, 240w, 400w, full)
    expect(mockWriteFile).toHaveBeenCalledTimes(5);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-orig.png", buf);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-120w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-240w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-400w.webp", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-full.webp", expect.any(Buffer));
  });

  it("throws a typed 409 when files already exist on disk", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-400w.webp"]);
    const buf = Buffer.from("test-img");
    // Typed as a CONFLICT so the admin UI gets a clean 409 instead of a
    // Sentry-reported 500 (OPENRIFT-API-C).
    await expect(
      processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 409,
      message: expect.stringContaining("Rehost files already exist for card-001"),
    });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("allows overwrite when allowOverwrite is true", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png"]);
    const buf = Buffer.from("test-img");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false, true);
    expect(mockWriteFile).toHaveBeenCalledTimes(5);
  });

  it("resizes portrait sources on the width axis", async () => {
    mockSharpMetadata = { width: 600, height: 900 };
    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "portrait-1", 0, false);

    // Portrait → width capped, height null
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(120, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(240, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, null, { withoutEnlargement: true });
  });

  it("resizes landscape sources on the height axis", async () => {
    mockSharpMetadata = { width: 900, height: 600 };
    await processAndSave(mockIo, Buffer.from("l"), ".png", "/tmp/out", "landscape-1", 0, false);

    // Landscape → height capped, width null
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 120, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 240, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 400, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 800, { withoutEnlargement: true });
  });

  it("treats a 90° rotated portrait source as landscape for short-edge capping", async () => {
    // Raw source is portrait (600×900); rotation=90 swaps to landscape
    // (900×600 post-rotate), so short-edge capping should hit the height axis.
    mockSharpMetadata = { width: 600, height: 900 };
    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "rotated-1", 90, false);

    expect(mockSharpInstance.rotate).toHaveBeenCalledWith(90);
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 120, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 240, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 400, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 800, { withoutEnlargement: true });
  });

  it("crops scans to the detected card box with a 2px shave when needsTrim=true", async () => {
    // 600x850 scan, card at (100,50)-(499,749), plus a dust speck near the
    // left edge that must NOT drag the box out (the old sharp trim did).
    mockGreyData = greyScan(600, 850, { left: 100, top: 50, width: 400, height: 700 });
    mockGreyData[300 * 600 + 5] = 0;

    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "trim-1", 0, true);

    expect(mockSharpInstance.extract).toHaveBeenCalledTimes(1);
    expect(mockSharpInstance.extract).toHaveBeenCalledWith({
      left: 102,
      top: 52,
      width: 396,
      height: 696,
    });
  });

  it("applies the capped auto-levels stretch to scans", async () => {
    // Card interior is uniform luminance 30 → black point 30, white point
    // floored at 220 → multiply 255/190, offset -30*multiply.
    mockGreyData = greyScan(600, 850, { left: 100, top: 50, width: 400, height: 700 });

    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "levels-1", 0, true);

    const multiply = 255 / 190;
    expect(mockSharpInstance.linear).toHaveBeenCalledTimes(1);
    expect(mockSharpInstance.linear).toHaveBeenCalledWith(multiply, -30 * multiply);
  });

  it("does not analyze or crop when needsTrim=false", async () => {
    // Default for digital images — the -orig must round-trip into variants
    // without any cropping or tone change, so a card with a pure-white
    // border doesn't accidentally get its border eaten.
    await processAndSave(mockIo, Buffer.from("d"), ".png", "/tmp/out", "digital-1", 0, false);
    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
    expect(mockSharpInstance.linear).not.toHaveBeenCalled();
  });

  it("preserves the -orig buffer regardless of needsTrim", async () => {
    const buf = Buffer.from("orig-bytes");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "orig-check", 0, true);
    // The orig write receives the untouched input buffer, not the cropped one.
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/orig-check-orig.png", buf);
  });

  it("skips the crop when the card already fills the scan", async () => {
    mockSharpMetadata = { width: 600, height: 900 };
    // Edge-to-edge card → detection is a no-op → no extract, no 1px shave.
    mockGreyData = greyScan(600, 900, { left: 0, top: 0, width: 600, height: 900 });

    await processAndSave(mockIo, Buffer.from("e"), ".png", "/tmp/out", "edge-1", 0, true);

    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
  });

  it("sweeps a pre-existing orig with a different extension before writing", async () => {
    // Existing dir holds a legacy png-orig; new rehost delivers webp.
    // processAndSave should delete the png-orig so we don't end up with both.
    mockReaddir.mockResolvedValue(["card-001-orig.png"]);
    await processAndSave(mockIo, Buffer.from("w"), ".webp", "/tmp/out", "card-001", 0, false, true);

    expect(mockUnlink).toHaveBeenCalledWith("/tmp/out/card-001-orig.png");
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-orig.webp", expect.any(Buffer));
  });
});

describe("computeScanCropBox", () => {
  it("finds the card's bounding box in a white scan", () => {
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("ignores isolated dust specks outside the card", () => {
    // Regression: a single dark pixel far left of the card used to pin
    // sharp's trim and leave a ~400px white margin on real scans.
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    grey[150 * 200 + 5] = 0; // dust at (5, 150)
    grey[295 * 200 + 90] = 0; // dust below the card at (90, 295)
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("returns the full frame for an edge-to-edge card", () => {
    const grey = greyScan(200, 300, { left: 0, top: 0, width: 200, height: 300 });
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 0,
      top: 0,
      width: 200,
      height: 300,
    });
  });

  it("returns null for a blank scan", () => {
    expect(computeScanCropBox(greyScan(200, 300), 200, 300)).toBeNull();
  });

  it("returns null when the buffer doesn't match the dimensions", () => {
    expect(computeScanCropBox(Buffer.from("tiny"), 200, 300)).toBeNull();
  });

  it("tightens away the shallow wedge a slightly tilted card leaves", () => {
    // Card body at rows 30..229; below it a 4-row "wedge" where only the
    // right half is still card (a tilted bottom edge). The wedge rows pass
    // the coarse threshold but sit under 85% coverage, so the bottom edge
    // tightens to the card body.
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    for (let y = 230; y < 234; y++) {
      for (let x = 90; x < 140; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 200,
    });
  });

  it("caps edge tightening so bright-edged art only loses a sliver", () => {
    // A 30-row region below the card body where only 40% of the width is
    // dark — like a card whose bottom-edge art is mostly bright. Tightening
    // wants to remove it all but must stop after max(4, 0.7%) = 4 rows.
    const grey = greyScan(200, 300, { left: 40, top: 30, width: 100, height: 200 });
    for (let y = 230; y < 260; y++) {
      for (let x = 40; x < 80; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    expect(computeScanCropBox(grey, 200, 300)).toEqual({
      left: 40,
      top: 30,
      width: 100,
      height: 226,
    });
  });
});

describe("computeScanLevels", () => {
  const fullBox = { left: 0, top: 0, width: 200, height: 300 };

  it("stretches a lifted black point back to 0", () => {
    // Uniform luminance 30 → black 30, white floored at 220.
    const grey = greyScan(200, 300, fullBox, 30);
    const multiply = 255 / (220 - 30);
    expect(computeScanLevels(grey, 200, fullBox)).toEqual({
      multiply,
      offset: -30 * multiply,
    });
  });

  it("caps the black point so dark art is not over-stretched", () => {
    // Uniform luminance 90: without the cap the stretch would map 90 → 0.
    const grey = greyScan(200, 300, fullBox, 90);
    const multiply = 255 / (220 - 40);
    expect(computeScanLevels(grey, 200, fullBox)).toEqual({
      multiply,
      offset: -40 * multiply,
    });
  });

  it("returns null when the scan already spans full range", () => {
    const grey = greyScan(200, 300, fullBox, 0);
    // Make the top half true white so both percentiles sit at the extremes.
    grey.fill(255, 0, 200 * 150);
    expect(computeScanLevels(grey, 200, fullBox)).toBeNull();
  });

  it("measures only inside the box", () => {
    // Dark field outside the box must not drag the black point below the
    // box interior's 30.
    const grey = Buffer.alloc(200 * 300, 0);
    const box = { left: 50, top: 50, width: 100, height: 100 };
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        grey[y * 200 + x] = 30;
      }
    }
    const multiply = 255 / (220 - 30);
    expect(computeScanLevels(grey, 200, box)).toEqual({
      multiply,
      offset: -30 * multiply,
    });
  });

  it("returns null for a degenerate box", () => {
    const grey = greyScan(200, 300);
    expect(computeScanLevels(grey, 200, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});

describe("deleteRehostFiles", () => {
  it("deletes matching files only", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png", "card-001-400w.webp", "other.webp"]);
    await deleteRehostFiles(mockIo, "/media/cards/set1/card-001");

    expect(mockUnlink).toHaveBeenCalledTimes(2);
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_MEDIA_DIR, "set1", "card-001-orig.png"));
    expect(mockUnlink).toHaveBeenCalledWith(join(CARD_MEDIA_DIR, "set1", "card-001-400w.webp"));
  });

  it("handles missing directory", async () => {
    mockReaddir.mockRejectedValue(new Error("ENOENT"));
    await deleteRehostFiles(mockIo, "/media/cards/set1/card-001");
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("swallows unlink errors", async () => {
    mockReaddir.mockResolvedValue(["base-orig.png"]);
    mockUnlink.mockRejectedValue(new Error("EPERM"));
    await deleteRehostFiles(mockIo, "/media/cards/set1/base"); // should not throw
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

/**
 * Build a {imageId, rehostedUrl} entry shaped like `listAllRehosted` rows for
 * the per-batch helper.
 * @returns Snapshot entry.
 */
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
    // Regression: previously called `updateRehostedUrl(id, null)` regardless of
    // originalUrl, which violated `chk_image_files_has_url` for uploaded images
    // (no originalUrl set) and surfaced as a Postgres error in admin UI.
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

    // The greyscale analysis pass only runs for scans (needsTrim=true).
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
    // Defensive: a row missing from the rotations/needsTrim map (e.g. raced
    // delete) must not retroactively start trimming. Defaulting to false
    // matches the digital-image-default invariant.
    const repo = makeMockRepo({});
    repo.getRotationsAndTrimByIds = vi.fn(() => Promise.resolve(new Map()));
    mockReaddir.mockImplementation(async () => ["card-orphan-orig.png"]);
    await regenerateImagesBatch(mockIo, repo, [snap("card-orphan")]);

    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
  });
});

// ─── runRegenerateImagesJob ──────────────────────────────────────────────

/**
 * Minimal in-memory job_runs repo good enough for runRegenerateImagesJob:
 * tracks the current `result` JSONB. Tests can mutate the stored value
 * directly via `setCancel` to simulate the cancel endpoint racing with the
 * job loop.
 * @returns A handle exposing the mock repo plus helpers to read/mutate the row.
 */
function makeFakeJobRunsRepo(initial: unknown = null) {
  const state: { stored: unknown } = { stored: initial };
  const repo = {
    updateResult: vi.fn(async (_id: string, result: unknown) => {
      state.stored = result;
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
  /** @returns The current stored checkpoint, or null. */
  const current = () => state.stored;
  /** Simulate the cancel endpoint flipping the flag in the row. */
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
    // 12 / batch_size 10 = 2 batches; plus the initial snapshot write = 3.
    expect(fake.repo.updateResult).toHaveBeenCalledTimes(3);
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

  it("isRegenerateCheckpoint accepts the canonical shape and rejects partial values", () => {
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
    expect(isRegenerateCheckpoint(ok)).toBe(true);
    expect(isRegenerateCheckpoint(null)).toBe(false);
    expect(isRegenerateCheckpoint({})).toBe(false);
    expect(isRegenerateCheckpoint({ ...ok, snapshot: "not-an-array" })).toBe(false);
    expect(isRegenerateCheckpoint({ ...ok, cancelRequested: "no" })).toBe(false);
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

describe("imageRehostedUrl", () => {
  it("builds the canonical rehosted URL using last 2 chars of UUID", () => {
    expect(imageRehostedUrl("00594247-a18a-4efd-8998-105449a4cf40")).toBe(
      "/media/cards/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });
});

describe("rehostSingleImage", () => {
  it("does nothing when image has no originalUrl", async () => {
    const repo = {
      getForRehost: vi.fn(async () => ({
        originalUrl: null,
        imageFileId: "if-1",
        rotation: 0,
        needsTrim: false,
      })),
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
        rotation: 0,
        needsTrim: false,
      })),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(mockFetch).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(repo.updateRehostedUrl).toHaveBeenCalledWith(
      "00594247-a18a-4efd-8998-105449a4cf40",
      "/media/cards/40/00594247-a18a-4efd-8998-105449a4cf40",
    );
  });

  it("propagates needsTrim from the image_file row to the scan analysis", async () => {
    const repo = {
      getForRehost: vi.fn(async () => ({
        originalUrl: "https://example.com/img.png",
        imageFileId: "00594247-a18a-4efd-8998-105449a4cf40",
        rotation: 0,
        needsTrim: true,
      })),
      updateRehostedUrl: vi.fn(async () => {}),
    } as any;

    await rehostSingleImage(mockIo, repo, "img-uuid");

    expect(mockSharpInstance.greyscale).toHaveBeenCalled();
  });

  it("swallows download errors silently", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    const repo = {
      getForRehost: vi.fn(async () => ({
        originalUrl: "https://example.com/img.png",
        imageFileId: "00594247-a18a-4efd-8998-105449a4cf40",
        rotation: 0,
        needsTrim: false,
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
