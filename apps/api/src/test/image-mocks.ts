/* oxlint-disable
   no-empty-function,
   promise/prefer-await-to-then,
   unicorn/no-useless-undefined
   -- test harness: mocks require Promise.resolve(), empty fns, explicit undefined */
/**
 * Shared fs / sharp / repo doubles for the `services/images` tests.
 *
 * Everything the image pipeline touches arrives through the injected `Io`, so
 * one fake `Io` plus a stub printing-images repo covers `variants`, `jobs` and
 * `maintenance`. `download` needs only the fetch and DNS halves of it, and
 * `scan-analysis` needs none of it — those files import correspondingly less.
 *
 * Vitest gives every test file its own module registry, so importing this
 * yields a fresh, per-file set of mocks. Call {@link resetImageMocks} in
 * `beforeEach` to clear call history between tests within a file.
 */
import { vi } from "vitest";

import type { Io } from "../io.js";

export const mockMkdir = vi.fn(() => Promise.resolve(undefined as any));
export const mockWriteFile = vi.fn(() => Promise.resolve(undefined as any));
export const mockReadFile = vi.fn(() => Promise.resolve(Buffer.from("img")));
export const mockReaddir = vi.fn((): Promise<any> => Promise.resolve([]));
export const mockRename = vi.fn(() => Promise.resolve(undefined as any));
export const mockUnlink = vi.fn(() => Promise.resolve(undefined as any));
export const mockStat = vi.fn(() => Promise.resolve({ size: 1024 }));

export const mockFetch = vi.fn(() =>
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

/** Override the dimensions `sharp().metadata()` reports for the next call. */
export function setSharpMetadata(metadata: { width: number; height: number }): void {
  mockSharpMetadata = metadata;
}

/** Feed a synthetic greyscale buffer to the scan-analysis path. */
export function setGreyData(grey: Buffer): void {
  mockGreyData = grey;
}

export const mockSharpInstance: any = {};
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
export function greyScan(
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

export const mockIo: Io = {
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
  dnsLookupAll: vi.fn(() => Promise.resolve([{ address: "203.0.113.10" }])),
};

/**
 * Creates a mock PrintingImagesRepo for rehostImages/clearAllRehosted/getRehostStatus.
 * @returns Mock repo object.
 */
export function makeMockRepo(
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

/**
 * Shape a `readdir(..., { withFileTypes: true })` entry.
 * @returns A minimal Dirent-like object.
 */
export const dirent = (name: string, isDir: boolean) => ({ name, isDirectory: () => isDir });

/** Reset every fs / sharp / fetch double to its default. Call in `beforeEach`. */
export function resetImageMocks(): void {
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockWriteFile.mockReset().mockResolvedValue(undefined);
  mockReadFile.mockReset().mockResolvedValue(Buffer.from("img"));
  mockReaddir.mockReset().mockResolvedValue([]);
  mockRename.mockReset().mockResolvedValue(undefined);
  mockUnlink.mockReset().mockResolvedValue(undefined);
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
}
