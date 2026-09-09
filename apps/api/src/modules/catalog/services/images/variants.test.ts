// oxlint-disable-next-line import/no-nodejs-modules -- assertions compare joined disk paths
import { join } from "node:path";

import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  greyScan,
  mockIo,
  mockMkdir,
  mockReaddir,
  mockSharpInstance,
  mockUnlink,
  mockWriteFile,
  resetImageMocks,
  setGreyData,
  setSharpMetadata,
} from "../../../../test/image-mocks.js";
import { CARD_MEDIA_DIR } from "./paths.js";
import {
  deleteRehostFiles,
  ensureOriginalOnDisk,
  generateWebpVariants,
  processAndSave,
  rehostFilesExist,
  straightenedSize,
} from "./variants.js";

const realIo = { ...mockIo, sharp };

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetImageMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
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
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false, null);

    expect(mockMkdir).toHaveBeenCalledTimes(2);
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
    await expect(
      processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false, null),
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
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false, null, true);
    expect(mockWriteFile).toHaveBeenCalledTimes(5);
  });

  it("resizes portrait sources on the width axis", async () => {
    setSharpMetadata({ width: 600, height: 900 });
    await processAndSave(
      mockIo,
      Buffer.from("p"),
      ".png",
      "/tmp/out",
      "portrait-1",
      0,
      false,
      null,
    );

    expect(mockSharpInstance.resize).toHaveBeenCalledWith(120, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(240, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, null, { withoutEnlargement: true });
  });

  it("resizes landscape sources on the height axis", async () => {
    setSharpMetadata({ width: 900, height: 600 });
    await processAndSave(
      mockIo,
      Buffer.from("l"),
      ".png",
      "/tmp/out",
      "landscape-1",
      0,
      false,
      null,
    );

    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 120, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 240, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 400, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 800, { withoutEnlargement: true });
  });

  it("treats a 90° rotated portrait source as landscape for short-edge capping", async () => {
    setSharpMetadata({ width: 600, height: 900 });
    await processAndSave(
      mockIo,
      Buffer.from("p"),
      ".png",
      "/tmp/out",
      "rotated-1",
      90,
      false,
      null,
    );

    expect(mockSharpInstance.rotate).toHaveBeenCalledWith(90);
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 120, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 240, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 400, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 800, { withoutEnlargement: true });
  });

  it("crops scans to the detected card box with a 2px shave when needsTrim=true", async () => {
    const grey = greyScan(600, 850, { left: 100, top: 50, width: 400, height: 700 });
    grey[300 * 600 + 5] = 0;
    setGreyData(grey);

    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "trim-1", 0, true, null);

    expect(mockSharpInstance.extract).toHaveBeenCalledTimes(1);
    expect(mockSharpInstance.extract).toHaveBeenCalledWith({
      left: 102,
      top: 52,
      width: 396,
      height: 696,
    });
  });

  it("applies the capped auto-levels stretch to scans", async () => {
    setGreyData(greyScan(600, 850, { left: 100, top: 50, width: 400, height: 700 }));

    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "levels-1", 0, true, null);

    const multiply = 255 / 190;
    expect(mockSharpInstance.linear).toHaveBeenCalledTimes(1);
    expect(mockSharpInstance.linear).toHaveBeenCalledWith(multiply, -30 * multiply);
  });

  it("does not analyze or crop when needsTrim=false", async () => {
    await processAndSave(mockIo, Buffer.from("d"), ".png", "/tmp/out", "digital-1", 0, false, null);
    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
    expect(mockSharpInstance.linear).not.toHaveBeenCalled();
  });

  it("preserves the -orig buffer regardless of needsTrim", async () => {
    const buf = Buffer.from("orig-bytes");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "orig-check", 0, true, null);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/orig-check-orig.png", buf);
  });

  it("skips the crop when the card already fills the scan", async () => {
    setSharpMetadata({ width: 600, height: 900 });
    setGreyData(greyScan(600, 900, { left: 0, top: 0, width: 600, height: 900 }));

    await processAndSave(mockIo, Buffer.from("e"), ".png", "/tmp/out", "edge-1", 0, true, null);

    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
  });

  it("sweeps a pre-existing orig with a different extension before writing", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png"]);
    await processAndSave(
      mockIo,
      Buffer.from("w"),
      ".webp",
      "/tmp/out",
      "card-001",
      0,
      false,
      null,
      true,
    );

    expect(mockUnlink).toHaveBeenCalledWith("/tmp/out/card-001-orig.png");
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/card-001-orig.webp", expect.any(Buffer));
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
    await deleteRehostFiles(mockIo, "/media/cards/set1/base");
  });
});

describe("ensureOriginalOnDisk", () => {
  const IMAGE_ID = "0000000000000000000000000000000ab";

  it("reports the stored pixel grid of an orig already on disk", async () => {
    mockReaddir.mockResolvedValue([`${IMAGE_ID}-orig.png`]);
    setSharpMetadata({ width: 640, height: 900 });

    expect(await ensureOriginalOnDisk(mockIo, IMAGE_ID, 0, false, null, null)).toEqual({
      url: `/media/cards/ab/${IMAGE_ID}-orig.png`,
      width: 640,
      height: 900,
    });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("fetches and rebuilds when the orig is missing", async () => {
    mockReaddir.mockResolvedValue([]);
    setSharpMetadata({ width: 300, height: 400 });

    const result = await ensureOriginalOnDisk(
      mockIo,
      IMAGE_ID,
      90,
      true,
      null,
      "https://example.test/card.png",
    );

    expect(result.url).toBe(`/media/cards/ab/${IMAGE_ID}-orig.png`);
    expect(mockWriteFile).toHaveBeenCalledWith(
      join(CARD_MEDIA_DIR, "ab", `${IMAGE_ID}-orig.png`),
      expect.any(Buffer),
    );
  });

  it("throws a typed 400 when there is neither a file nor an original URL", async () => {
    mockReaddir.mockResolvedValue([]);

    await expect(
      ensureOriginalOnDisk(mockIo, IMAGE_ID, 0, false, null, null),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 400,
      message: "Image has no original to straighten",
    });
  });
});

describe("straightenedSize", () => {
  const rect = (width: number, height: number): ImageQuad => [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];

  it("takes the longer of each pair of opposite edges", () => {
    const uneven: ImageQuad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 80, y: 200 },
      { x: 0, y: 180 },
    ];
    expect(straightenedSize(uneven)).toEqual({ width: 144, height: 201 });
  });

  it("forces the card aspect on the short axis of a portrait quad", () => {
    expect(straightenedSize(rect(300, 400))).toEqual({ width: 286, height: 400 });
  });

  it("forces the card aspect on the short axis of a landscape quad", () => {
    expect(straightenedSize(rect(400, 300))).toEqual({ width: 400, height: 286 });
  });

  it("caps the longer side and scales the other with it", () => {
    expect(straightenedSize(rect(3000, 4000))).toEqual({ width: 1718, height: 2400 });
  });

  it("leaves a quad under the cap alone", () => {
    expect(straightenedSize(rect(1700, 2400))).toEqual({ width: 1718, height: 2400 });
  });
});

describe("generateWebpVariants with a quad", () => {
  async function quadrantPng(): Promise<Buffer> {
    const width = 120;
    const height = 120;
    const box = { left: 10, top: 5, width: 80, height: 90 };
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = box.top; y < box.top + box.height; y++) {
      for (let x = box.left; x < box.left + box.width; x++) {
        const right = x >= box.left + box.width / 2;
        const bottom = y >= box.top + box.height / 2;
        const color = bottom
          ? right
            ? [0, 0, 255]
            : [255, 255, 0]
          : right
            ? [0, 255, 0]
            : [255, 0, 0];
        const i = (y * width + x) * 3;
        pixels[i] = color[0]!;
        pixels[i + 1] = color[1]!;
        pixels[i + 2] = color[2]!;
      }
    }
    return sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
  }

  const BOX: ImageQuad = [
    { x: 10, y: 5 },
    { x: 90, y: 5 },
    { x: 90, y: 95 },
    { x: 10, y: 95 },
  ];

  function writtenVariant(suffix: string): Buffer {
    const call = mockWriteFile.mock.calls.find((args) => String(args[0]).endsWith(suffix));
    expect(call).toBeDefined();
    return call![1] as Buffer;
  }

  async function cornerColors(buffer: Buffer): Promise<number[][]> {
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number): number[] => {
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    const inset = 4;
    return [
      at(inset, inset),
      at(info.width - 1 - inset, inset),
      at(info.width - 1 - inset, info.height - 1 - inset),
      at(inset, info.height - 1 - inset),
    ];
  }

  it("rectifies the quad into a card-shaped variant", async () => {
    await generateWebpVariants(realIo, await quadrantPng(), "/tmp/out", "quad-1", 0, false, BOX);

    const full = await sharp(writtenVariant("-full.webp")).metadata();
    expect({ width: full.width, height: full.height }).toEqual(straightenedSize(BOX));

    const [topLeft, topRight, bottomRight, bottomLeft] = await cornerColors(
      writtenVariant("-full.webp"),
    );
    expect(dominant(topLeft!)).toBe("red");
    expect(dominant(topRight!)).toBe("green");
    expect(dominant(bottomRight!)).toBe("blue");
    expect(dominant(bottomLeft!)).toBe("yellow");
  });

  it("rotates after straightening", async () => {
    await generateWebpVariants(realIo, await quadrantPng(), "/tmp/out", "quad-2", 90, false, BOX);

    const [topLeft, topRight] = await cornerColors(writtenVariant("-full.webp"));
    expect(dominant(topLeft!)).toBe("yellow");
    expect(dominant(topRight!)).toBe("red");
  });

  it("rejects a quad that reaches outside the original", async () => {
    const outside: ImageQuad = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 95 },
      { x: 0, y: 95 },
    ];
    await expect(
      generateWebpVariants(realIo, await quadrantPng(), "/tmp/out", "quad-3", 0, false, outside),
    ).rejects.toThrow("Quad does not fit the original image");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a degenerate quad", async () => {
    const collapsed: ImageQuad = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ];
    await expect(
      generateWebpVariants(realIo, await quadrantPng(), "/tmp/out", "quad-4", 0, false, collapsed),
    ).rejects.toThrow("Quad does not fit the original image");
  });

  it("leaves the image untouched when no quad is stored", async () => {
    await generateWebpVariants(realIo, await quadrantPng(), "/tmp/out", "quad-5", 0, false, null);

    const full = await sharp(writtenVariant("-full.webp")).metadata();
    expect({ width: full.width, height: full.height }).toEqual({ width: 120, height: 120 });
  });
});

function dominant([r, g, b]: number[]): string {
  const high = (v: number | undefined): boolean => (v ?? 0) > 150;
  const low = (v: number | undefined): boolean => (v ?? 0) < 100;
  if (high(r) && low(g) && low(b)) {
    return "red";
  }
  if (low(r) && high(g) && low(b)) {
    return "green";
  }
  if (low(r) && low(g) && high(b)) {
    return "blue";
  }
  if (high(r) && high(g) && low(b)) {
    return "yellow";
  }
  return `other(${r},${g},${b})`;
}
