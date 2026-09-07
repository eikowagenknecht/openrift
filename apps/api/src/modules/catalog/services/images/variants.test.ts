// oxlint-disable-next-line import/no-nodejs-modules -- assertions compare joined disk paths
import { join } from "node:path";

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
import { deleteRehostFiles, processAndSave, rehostFilesExist } from "./variants.js";

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
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "card-001", 0, false);

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
    setSharpMetadata({ width: 600, height: 900 });
    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "portrait-1", 0, false);

    expect(mockSharpInstance.resize).toHaveBeenCalledWith(120, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(240, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, null, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, null, { withoutEnlargement: true });
  });

  it("resizes landscape sources on the height axis", async () => {
    setSharpMetadata({ width: 900, height: 600 });
    await processAndSave(mockIo, Buffer.from("l"), ".png", "/tmp/out", "landscape-1", 0, false);

    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 120, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 240, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 400, { withoutEnlargement: true });
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(null, 800, { withoutEnlargement: true });
  });

  it("treats a 90° rotated portrait source as landscape for short-edge capping", async () => {
    setSharpMetadata({ width: 600, height: 900 });
    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "rotated-1", 90, false);

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
    setGreyData(greyScan(600, 850, { left: 100, top: 50, width: 400, height: 700 }));

    await processAndSave(mockIo, Buffer.from("p"), ".png", "/tmp/out", "levels-1", 0, true);

    const multiply = 255 / 190;
    expect(mockSharpInstance.linear).toHaveBeenCalledTimes(1);
    expect(mockSharpInstance.linear).toHaveBeenCalledWith(multiply, -30 * multiply);
  });

  it("does not analyze or crop when needsTrim=false", async () => {
    await processAndSave(mockIo, Buffer.from("d"), ".png", "/tmp/out", "digital-1", 0, false);
    expect(mockSharpInstance.greyscale).not.toHaveBeenCalled();
    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
    expect(mockSharpInstance.linear).not.toHaveBeenCalled();
  });

  it("preserves the -orig buffer regardless of needsTrim", async () => {
    const buf = Buffer.from("orig-bytes");
    await processAndSave(mockIo, buf, ".png", "/tmp/out", "orig-check", 0, true);
    expect(mockWriteFile).toHaveBeenCalledWith("/tmp/out/orig-check-orig.png", buf);
  });

  it("skips the crop when the card already fills the scan", async () => {
    setSharpMetadata({ width: 600, height: 900 });
    setGreyData(greyScan(600, 900, { left: 0, top: 0, width: 600, height: 900 }));

    await processAndSave(mockIo, Buffer.from("e"), ".png", "/tmp/out", "edge-1", 0, true);

    expect(mockSharpInstance.extract).not.toHaveBeenCalled();
  });

  it("sweeps a pre-existing orig with a different extension before writing", async () => {
    mockReaddir.mockResolvedValue(["card-001-orig.png"]);
    await processAndSave(mockIo, Buffer.from("w"), ".webp", "/tmp/out", "card-001", 0, false, true);

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
